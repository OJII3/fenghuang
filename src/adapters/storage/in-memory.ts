import type { Episode } from "../../core/domain/episode.ts";
import type { FSRSCard } from "../../core/domain/fsrs.ts";
import type { SemanticFact } from "../../core/domain/semantic-fact.ts";
import type { ChatMessage, FactCategory } from "../../core/domain/types.ts";
import type { StoragePort } from "../../ports/storage.ts";
import { cosineSimilarity } from "./vector-math.ts";

/** In-memory storage adapter for testing */
export class InMemoryStorageAdapter implements StoragePort {
	private episodes = new Map<string, Episode>();
	private facts = new Map<string, SemanticFact>();
	private messageQueues = new Map<string, ChatMessage[]>();

	// --- Episodic memory ---

	async saveEpisode(userId: string, episode: Episode): Promise<void> {
		if (episode.userId !== userId) {
			throw new Error("episode.userId does not match userId");
		}
		this.episodes.set(episode.id, { ...episode });
	}

	async getEpisodes(userId: string): Promise<Episode[]> {
		return [...this.episodes.values()].filter((e) => e.userId === userId);
	}

	async getEpisodeById(userId: string, episodeId: string): Promise<Episode | null> {
		const episode = this.episodes.get(episodeId) ?? null;
		if (episode && episode.userId !== userId) {
			return null;
		}
		return episode;
	}

	async getUnconsolidatedEpisodes(userId: string): Promise<Episode[]> {
		return [...this.episodes.values()].filter(
			(e) => e.userId === userId && e.consolidatedAt === null,
		);
	}

	async updateEpisodeFSRS(userId: string, episodeId: string, card: FSRSCard): Promise<void> {
		const episode = this.episodes.get(episodeId);
		if (!episode || episode.userId !== userId) {
			return;
		}
		episode.stability = card.stability;
		episode.difficulty = card.difficulty;
		episode.lastReviewedAt = card.lastReviewedAt;
	}

	async markEpisodeConsolidated(userId: string, episodeId: string): Promise<void> {
		const episode = this.episodes.get(episodeId);
		if (!episode || episode.userId !== userId) {
			return;
		}
		episode.consolidatedAt = new Date();
	}

	// --- Semantic memory ---

	async saveFact(userId: string, fact: SemanticFact): Promise<void> {
		if (fact.userId !== userId) {
			throw new Error("fact.userId does not match userId");
		}
		this.facts.set(fact.id, { ...fact });
	}

	async getFacts(userId: string): Promise<SemanticFact[]> {
		return [...this.facts.values()].filter((f) => f.userId === userId && f.invalidAt === null);
	}

	async getFactsByCategory(userId: string, category: FactCategory): Promise<SemanticFact[]> {
		return [...this.facts.values()].filter(
			(f) => f.userId === userId && f.category === category && f.invalidAt === null,
		);
	}

	async invalidateFact(userId: string, factId: string, invalidAt: Date): Promise<void> {
		const fact = this.facts.get(factId);
		if (!fact || fact.userId !== userId) {
			return;
		}
		fact.invalidAt = invalidAt;
	}

	async updateFact(
		userId: string,
		factId: string,
		updates: Partial<Omit<SemanticFact, "id" | "userId">>,
	): Promise<void> {
		const fact = this.facts.get(factId);
		if (!fact || fact.userId !== userId) {
			return;
		}
		this.facts.set(factId, { ...fact, ...updates, id: fact.id, userId: fact.userId });
	}

	// --- Message queue ---

	async pushMessage(userId: string, message: ChatMessage): Promise<void> {
		const queue = this.messageQueues.get(userId) ?? [];
		queue.push({ ...message });
		this.messageQueues.set(userId, queue);
	}

	async getMessageQueue(userId: string): Promise<ChatMessage[]> {
		return [...(this.messageQueues.get(userId) ?? [])];
	}

	async clearMessageQueue(userId: string): Promise<void> {
		this.messageQueues.delete(userId);
	}

	// --- Search ---

	async searchEpisodes(userId: string, query: string, limit: number): Promise<Episode[]> {
		const safeLim = Math.max(1, Math.min(limit, 1000));
		const lowerQuery = query.toLowerCase();
		return [...this.episodes.values()]
			.filter(
				(e) =>
					e.userId === userId &&
					(e.title.toLowerCase().includes(lowerQuery) ||
						e.summary.toLowerCase().includes(lowerQuery)),
			)
			.slice(0, safeLim);
	}

	async searchFacts(userId: string, query: string, limit: number): Promise<SemanticFact[]> {
		const safeLim = Math.max(1, Math.min(limit, 1000));
		const lowerQuery = query.toLowerCase();
		return [...this.facts.values()]
			.filter(
				(f) =>
					f.userId === userId &&
					f.invalidAt === null &&
					(f.fact.toLowerCase().includes(lowerQuery) ||
						f.keywords.some((k) => k.toLowerCase().includes(lowerQuery))),
			)
			.slice(0, safeLim);
	}

	// --- Vector search ---

	async searchEpisodesByEmbedding(
		userId: string,
		embedding: number[],
		limit: number,
	): Promise<Episode[]> {
		const safeLim = Math.max(1, Math.min(limit, 1000));
		return [...this.episodes.values()]
			.filter((e) => e.userId === userId)
			.map((e) => ({ episode: e, similarity: cosineSimilarity(embedding, e.embedding) }))
			.toSorted((a, b) => b.similarity - a.similarity)
			.slice(0, safeLim)
			.map((r) => r.episode);
	}

	async searchFactsByEmbedding(
		userId: string,
		embedding: number[],
		limit: number,
	): Promise<SemanticFact[]> {
		const safeLim = Math.max(1, Math.min(limit, 1000));
		return [...this.facts.values()]
			.filter((f) => f.userId === userId && f.invalidAt === null)
			.map((f) => ({ fact: f, similarity: cosineSimilarity(embedding, f.embedding) }))
			.toSorted((a, b) => b.similarity - a.similarity)
			.slice(0, safeLim)
			.map((r) => r.fact);
	}
}
