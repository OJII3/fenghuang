import type { Episode } from "../core/domain/episode.ts";
import type { FSRSCard } from "../core/domain/fsrs.ts";
import type { SemanticFact } from "../core/domain/semantic-fact.ts";
import type { ChatMessage, FactCategory } from "../core/domain/types.ts";

/** Storage Port — Core depends only on this interface */
export interface StoragePort {
	// Episodic memory
	saveEpisode(userId: string, episode: Episode): Promise<void>;
	getEpisodes(userId: string): Promise<Episode[]>;
	getEpisodeById(episodeId: string): Promise<Episode | null>;
	getUnconsolidatedEpisodes(userId: string): Promise<Episode[]>;
	updateEpisodeFSRS(episodeId: string, card: FSRSCard): Promise<void>;
	markEpisodeConsolidated(episodeId: string): Promise<void>;

	// Semantic memory
	saveFact(userId: string, fact: SemanticFact): Promise<void>;
	getFacts(userId: string): Promise<SemanticFact[]>;
	getFactsByCategory(userId: string, category: FactCategory): Promise<SemanticFact[]>;
	invalidateFact(factId: string, invalidAt: Date): Promise<void>;
	updateFact(factId: string, updates: Partial<SemanticFact>): Promise<void>;

	// Message queue
	pushMessage(userId: string, message: ChatMessage): Promise<void>;
	getMessageQueue(userId: string): Promise<ChatMessage[]>;
	clearMessageQueue(userId: string): Promise<void>;

	// Search
	searchEpisodes(userId: string, query: string, limit: number): Promise<Episode[]>;
	searchFacts(userId: string, query: string, limit: number): Promise<SemanticFact[]>;
}
