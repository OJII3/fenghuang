import type { LLMPort } from "../ports/llm.ts";
import type { StoragePort } from "../ports/storage.ts";

/** Episodic memory service — manages episode lifecycle */
export class EpisodicMemory {
	constructor(
		protected llm: LLMPort,
		protected storage: StoragePort,
	) {}

	// TODO: implement in M2
}
