import type { LLMPort } from "../ports/llm.ts";
import type { StoragePort } from "../ports/storage.ts";

/** Consolidation pipeline — converts episodes into semantic facts */
export class ConsolidationPipeline {
	constructor(
		protected llm: LLMPort,
		protected storage: StoragePort,
	) {}

	// TODO: implement in M3
}
