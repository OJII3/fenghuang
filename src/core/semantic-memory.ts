import type { StoragePort } from "../ports/storage.ts";
import type { SemanticFact } from "./domain/semantic-fact.ts";
import type { FactCategory } from "./domain/types.ts";

/** Semantic memory service — manages persistent facts extracted from episodes */
export class SemanticMemory {
	constructor(protected storage: StoragePort) {}

	/** Get all valid facts for a user */
	async getFacts(userId: string): Promise<SemanticFact[]> {
		return this.storage.getFacts(userId);
	}

	/** Get valid facts for a user filtered by category */
	async getFactsByCategory(userId: string, category: FactCategory): Promise<SemanticFact[]> {
		return this.storage.getFactsByCategory(userId, category);
	}

	/** Search facts by query */
	async search(userId: string, query: string, limit: number): Promise<SemanticFact[]> {
		return this.storage.searchFacts(userId, query, limit);
	}

	/** Invalidate a fact (mark as no longer valid) */
	async invalidate(userId: string, factId: string, invalidAt: Date = new Date()): Promise<void> {
		return this.storage.invalidateFact(userId, factId, invalidAt);
	}
}
