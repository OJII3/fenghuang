import type { Episode } from "../../core/domain/episode.ts";
import type { FSRSCard } from "../../core/domain/fsrs.ts";
import type { SemanticFact } from "../../core/domain/semantic-fact.ts";
import type { ChatMessage, FactCategory } from "../../core/domain/types.ts";
import type { StoragePort } from "../../ports/storage.ts";

/** In-memory storage adapter for testing */
export class InMemoryStorageAdapter implements StoragePort {
	private episodes = new Map<string, Episode>();
	private facts = new Map<string, SemanticFact>();
	private messageQueues = new Map<string, ChatMessage[]>();

	// --- Episodic memory ---

	async saveEpisode(_userId: string, episode: Episode): Promise<void> {
		this.episodes.set(episode.id, { ...episode });
	}

	async getEpisodes(userId: string): Promise<Episode[]> {
		return [...this.episodes.values()].filter((e) => e.userId === userId);
	}

	async getEpisodeById(episodeId: string): Promise<Episode | null> {
		return this.episodes.get(episodeId) ?? null;
	}

	async getUnconsolidatedEpisodes(userId: string): Promise<Episode[]> {
		return [...this.episodes.values()].filter(
			(e) => e.userId === userId && e.consolidatedAt === null,
		);
	}

	async updateEpisodeFSRS(episodeId: string, card: FSRSCard): Promise<void> {
		const episode = this.episodes.get(episodeId);
		if (!episode) {
			return;
		}
		episode.stability = card.stability;
		episode.difficulty = card.difficulty;
		episode.lastReviewedAt = card.lastReviewedAt;
	}

	async markEpisodeConsolidated(episodeId: string): Promise<void> {
		const episode = this.episodes.get(episodeId);
		if (!episode) {
			return;
		}
		episode.consolidatedAt = new Date();
	}

	// --- Semantic memory ---

	async saveFact(_userId: string, fact: SemanticFact): Promise<void> {
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

	async invalidateFact(factId: string, invalidAt: Date): Promise<void> {
		const fact = this.facts.get(factId);
		if (!fact) {
			return;
		}
		fact.invalidAt = invalidAt;
	}

	async updateFact(factId: string, updates: Partial<SemanticFact>): Promise<void> {
		const fact = this.facts.get(factId);
		if (!fact) {
			return;
		}
		Object.assign(fact, updates);
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
		const lowerQuery = query.toLowerCase();
		return [...this.episodes.values()]
			.filter(
				(e) =>
					e.userId === userId &&
					(e.title.toLowerCase().includes(lowerQuery) ||
						e.summary.toLowerCase().includes(lowerQuery)),
			)
			.slice(0, limit);
	}

	async searchFacts(userId: string, query: string, limit: number): Promise<SemanticFact[]> {
		const lowerQuery = query.toLowerCase();
		return [...this.facts.values()]
			.filter(
				(f) =>
					f.userId === userId &&
					f.invalidAt === null &&
					(f.fact.toLowerCase().includes(lowerQuery) ||
						f.keywords.some((k) => k.toLowerCase().includes(lowerQuery))),
			)
			.slice(0, limit);
	}
}
