import { ConsolidationPipeline } from "./core/consolidation.ts";
import { EpisodicMemory } from "./core/episodic.ts";
import { Retrieval } from "./core/retrieval.ts";
import { Segmenter } from "./core/segmenter.ts";
import type { LLMPort } from "./ports/llm.ts";
import type { StoragePort } from "./ports/storage.ts";

export type { CreateEpisodeParams, Episode } from "./core/domain/episode.ts";
// Re-export pure functions
export { createEpisode } from "./core/domain/episode.ts";
export type { FSRSCard } from "./core/domain/fsrs.ts";
export { FSRS_CONFIG, retrievability, reviewCard } from "./core/domain/fsrs.ts";
export type { CreateFactParams, SemanticFact } from "./core/domain/semantic-fact.ts";
export { createFact } from "./core/domain/semantic-fact.ts";
export type {
	ChatMessage,
	ConsolidationAction,
	FactCategory,
	MessageRole,
	ReviewRating,
} from "./core/domain/types.ts";
export { SURPRISE_VALUES } from "./core/domain/types.ts";
// Re-export public types
export type { LLMPort, Schema } from "./ports/llm.ts";
export type { StoragePort } from "./ports/storage.ts";

/** Fenghuang instance — the main entry point */
export interface Fenghuang {
	segmenter: Segmenter;
	episodic: EpisodicMemory;
	consolidation: ConsolidationPipeline;
	retrieval: Retrieval;
}

/** Options for creating a Fenghuang instance */
export interface CreateFenghuangOptions {
	llm: LLMPort;
	storage: StoragePort;
}

/** Create a Fenghuang instance with the given adapters */
export function createFenghuang(opts: CreateFenghuangOptions): Fenghuang {
	const { llm, storage } = opts;

	return {
		segmenter: new Segmenter(llm, storage),
		episodic: new EpisodicMemory(llm, storage),
		consolidation: new ConsolidationPipeline(llm, storage),
		retrieval: new Retrieval(llm, storage),
	};
}
