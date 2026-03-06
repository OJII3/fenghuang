import type { LLMPort } from "../ports/llm.ts";
import type { StoragePort } from "../ports/storage.ts";
import type { Episode } from "./domain/episode.ts";
import { retrievability } from "./domain/fsrs.ts";
import type { SemanticFact } from "./domain/semantic-fact.ts";
import { validateUserId } from "./domain/utils.ts";

/** Options for configuring retrieval behavior */
export interface RetrievalOptions {
	/** Maximum number of results per category (default 10) */
	limit?: number;
	/** Weight for text search ranking in RRF (default 1.0) */
	textWeight?: number;
	/** Weight for vector search ranking in RRF (default 1.0) */
	vectorWeight?: number;
	/** Weight for FSRS retrievability boost on episodes (default 0.5) */
	fsrsWeight?: number;
	/** Current time — injectable for testing (default new Date()) */
	now?: Date;
}

/** An episode with its retrieval score and retrievability */
export interface ScoredEpisode {
	episode: Episode;
	score: number;
	retrievability: number;
}

/** A semantic fact with its retrieval score */
export interface ScoredFact {
	fact: SemanticFact;
	score: number;
}

/** Combined retrieval result */
export interface RetrievalResult {
	episodes: ScoredEpisode[];
	facts: ScoredFact[];
}

/** RRF constant (TREC standard) */
const RRF_K = 60;

/**
 * Reciprocal Rank Fusion — merge multiple ranked lists into a single score map.
 *
 * @param rankedLists Array of { items, weight } where items are in rank order (best first)
 * @param getId Function to extract a unique key from each item
 * @returns Map of id → fused score
 */
export function reciprocalRankFusion<T>(
	rankedLists: { items: T[]; weight: number }[],
	getId: (item: T) => string,
): Map<string, number> {
	const scores = new Map<string, number>();
	for (const { items, weight } of rankedLists) {
		for (let rank = 0; rank < items.length; rank++) {
			const item = items[rank];
			if (item !== undefined) {
				const id = getId(item);
				const prev = scores.get(id) ?? 0;
				scores.set(id, prev + weight / (RRF_K + rank + 1));
			}
		}
	}
	return scores;
}

/** Build an id → item lookup map from multiple arrays */
function buildLookup<T extends { id: string }>(...lists: T[][]): Map<string, T> {
	const map = new Map<string, T>();
	for (const list of lists) {
		for (const item of list) {
			map.set(item.id, item);
		}
	}
	return map;
}

interface EpisodeScoringContext {
	rrfScores: Map<string, number>;
	episodeMap: Map<string, Episode>;
	fsrsWeight: number;
	now: Date;
}

/** Score episodes by combining RRF scores with FSRS retrievability */
function scoreEpisodes(ctx: EpisodeScoringContext): ScoredEpisode[] {
	const scored: ScoredEpisode[] = [];
	for (const [id, rrfScore] of ctx.rrfScores) {
		const episode = ctx.episodeMap.get(id);
		if (episode) {
			const r = retrievability(
				{
					stability: episode.stability,
					difficulty: episode.difficulty,
					lastReviewedAt: episode.lastReviewedAt,
				},
				ctx.now,
			);
			scored.push({ episode, score: rrfScore + ctx.fsrsWeight * r, retrievability: r });
		}
	}
	return scored.toSorted((a, b) => b.score - a.score);
}

/** Score facts by RRF scores */
function scoreFacts(
	rrfScores: Map<string, number>,
	factMap: Map<string, SemanticFact>,
): ScoredFact[] {
	const scored: ScoredFact[] = [];
	for (const [id, score] of rrfScores) {
		const fact = factMap.get(id);
		if (fact) {
			scored.push({ fact, score });
		}
	}
	return scored.toSorted((a, b) => b.score - a.score);
}

/** Default candidate limit for search queries */
const CANDIDATE_LIMIT = 50;

/** Retrieval service — hybrid search with FSRS reranking */
export class Retrieval {
	constructor(
		protected llm: LLMPort,
		protected storage: StoragePort,
	) {}

	/** Run all 4 searches in parallel */
	private runSearches(userId: string, query: string, queryEmbedding: number[]) {
		return Promise.all([
			this.storage.searchEpisodes(userId, query, CANDIDATE_LIMIT),
			this.storage.searchFacts(userId, query, CANDIDATE_LIMIT),
			this.storage.searchEpisodesByEmbedding(userId, queryEmbedding, CANDIDATE_LIMIT),
			this.storage.searchFactsByEmbedding(userId, queryEmbedding, CANDIDATE_LIMIT),
		]);
	}

	/** Retrieve memories matching a query using hybrid text+vector search with FSRS reranking */
	async retrieve(
		userId: string,
		query: string,
		options: RetrievalOptions = {},
	): Promise<RetrievalResult> {
		validateUserId(userId);
		const {
			limit = 10,
			textWeight = 1.0,
			vectorWeight = 1.0,
			fsrsWeight = 0.5,
			now = new Date(),
		} = options;

		const queryEmbedding = await this.llm.embed(query);
		const [textEpisodes, textFacts, vectorEpisodes, vectorFacts] = await this.runSearches(
			userId,
			query,
			queryEmbedding,
		);

		const episodeRrf = reciprocalRankFusion(
			[
				{ items: textEpisodes, weight: textWeight },
				{ items: vectorEpisodes, weight: vectorWeight },
			],
			(ep) => ep.id,
		);
		const episodes = scoreEpisodes({
			rrfScores: episodeRrf,
			episodeMap: buildLookup(textEpisodes, vectorEpisodes),
			fsrsWeight,
			now,
		}).slice(0, limit);

		const factRrf = reciprocalRankFusion(
			[
				{ items: textFacts, weight: textWeight },
				{ items: vectorFacts, weight: vectorWeight },
			],
			(f) => f.id,
		);
		const facts = scoreFacts(factRrf, buildLookup(textFacts, vectorFacts)).slice(0, limit);

		return { episodes, facts };
	}
}
