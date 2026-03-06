import type { StoragePort } from "../ports/storage.ts";
import type { Episode } from "./domain/episode.ts";
import type { FSRSCard } from "./domain/fsrs.ts";
import { retrievability, reviewCard } from "./domain/fsrs.ts";
import type { ReviewRating } from "./domain/types.ts";

/** Episodic memory service — manages episode lifecycle */
export class EpisodicMemory {
	constructor(protected storage: StoragePort) {}

	/** Get all episodes for a user */
	async getEpisodes(userId: string): Promise<Episode[]> {
		return this.storage.getEpisodes(userId);
	}

	/** Get a single episode by ID */
	async getEpisodeById(episodeId: string): Promise<Episode | null> {
		return this.storage.getEpisodeById(episodeId);
	}

	/** Get unconsolidated episodes for a user */
	async getUnconsolidated(userId: string): Promise<Episode[]> {
		return this.storage.getUnconsolidatedEpisodes(userId);
	}

	/** Search episodes by query */
	async search(userId: string, query: string, limit: number): Promise<Episode[]> {
		return this.storage.searchEpisodes(userId, query, limit);
	}

	/**
	 * Review an episode — update FSRS parameters based on rating.
	 * Called when a memory is retrieved and its relevance is evaluated.
	 */
	async review(
		episodeId: string,
		rating: ReviewRating,
		now: Date = new Date(),
	): Promise<FSRSCard | null> {
		const episode = await this.storage.getEpisodeById(episodeId);
		if (!episode) {
			return null;
		}

		const card: FSRSCard = {
			stability: episode.stability,
			difficulty: episode.difficulty,
			lastReviewedAt: episode.lastReviewedAt,
		};

		const updated = reviewCard(card, rating, now);
		await this.storage.updateEpisodeFSRS(episodeId, updated);
		return updated;
	}

	/** Mark an episode as consolidated into semantic memory */
	async markConsolidated(episodeId: string): Promise<void> {
		return this.storage.markEpisodeConsolidated(episodeId);
	}

	/** Calculate the current retrievability of an episode */
	getRetrievability(episode: Episode, now: Date = new Date()): number {
		return retrievability(
			{
				stability: episode.stability,
				difficulty: episode.difficulty,
				lastReviewedAt: episode.lastReviewedAt,
			},
			now,
		);
	}
}
