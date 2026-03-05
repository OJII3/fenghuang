import type { LLMPort } from "../ports/llm.ts";
import type { StoragePort } from "../ports/storage.ts";

/** Retrieval service — hybrid search with FSRS reranking */
export class Retrieval {
	constructor(
		protected llm: LLMPort,
		protected storage: StoragePort,
	) {}

	// TODO: implement in M4
}
