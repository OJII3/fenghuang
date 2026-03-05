import type { Episode } from "../../core/domain/episode.ts";
import type { FSRSCard } from "../../core/domain/fsrs.ts";
import type { SemanticFact } from "../../core/domain/semantic-fact.ts";
import type { ChatMessage, FactCategory } from "../../core/domain/types.ts";
import type { StoragePort } from "../../ports/storage.ts";

/** SQLite storage adapter using bun:sqlite */
export class SQLiteStorageAdapter implements StoragePort {
	// TODO: implement in M2 with bun:sqlite

	async saveEpisode(_userId: string, _episode: Episode): Promise<void> {
		throw new Error("Not implemented: SQLiteStorageAdapter.saveEpisode");
	}

	async getEpisodes(_userId: string): Promise<Episode[]> {
		throw new Error("Not implemented: SQLiteStorageAdapter.getEpisodes");
	}

	async getEpisodeById(_episodeId: string): Promise<Episode | null> {
		throw new Error("Not implemented: SQLiteStorageAdapter.getEpisodeById");
	}

	async getUnconsolidatedEpisodes(_userId: string): Promise<Episode[]> {
		throw new Error("Not implemented: SQLiteStorageAdapter.getUnconsolidatedEpisodes");
	}

	async updateEpisodeFSRS(_episodeId: string, _card: FSRSCard): Promise<void> {
		throw new Error("Not implemented: SQLiteStorageAdapter.updateEpisodeFSRS");
	}

	async markEpisodeConsolidated(_episodeId: string): Promise<void> {
		throw new Error("Not implemented: SQLiteStorageAdapter.markEpisodeConsolidated");
	}

	async saveFact(_userId: string, _fact: SemanticFact): Promise<void> {
		throw new Error("Not implemented: SQLiteStorageAdapter.saveFact");
	}

	async getFacts(_userId: string): Promise<SemanticFact[]> {
		throw new Error("Not implemented: SQLiteStorageAdapter.getFacts");
	}

	async getFactsByCategory(_userId: string, _category: FactCategory): Promise<SemanticFact[]> {
		throw new Error("Not implemented: SQLiteStorageAdapter.getFactsByCategory");
	}

	async invalidateFact(_factId: string, _invalidAt: Date): Promise<void> {
		throw new Error("Not implemented: SQLiteStorageAdapter.invalidateFact");
	}

	async updateFact(_factId: string, _updates: Partial<SemanticFact>): Promise<void> {
		throw new Error("Not implemented: SQLiteStorageAdapter.updateFact");
	}

	async pushMessage(_userId: string, _message: ChatMessage): Promise<void> {
		throw new Error("Not implemented: SQLiteStorageAdapter.pushMessage");
	}

	async getMessageQueue(_userId: string): Promise<ChatMessage[]> {
		throw new Error("Not implemented: SQLiteStorageAdapter.getMessageQueue");
	}

	async clearMessageQueue(_userId: string): Promise<void> {
		throw new Error("Not implemented: SQLiteStorageAdapter.clearMessageQueue");
	}

	async searchEpisodes(_userId: string, _query: string, _limit: number): Promise<Episode[]> {
		throw new Error("Not implemented: SQLiteStorageAdapter.searchEpisodes");
	}

	async searchFacts(_userId: string, _query: string, _limit: number): Promise<SemanticFact[]> {
		throw new Error("Not implemented: SQLiteStorageAdapter.searchFacts");
	}
}
