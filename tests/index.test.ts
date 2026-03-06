import { describe, expect, test } from "bun:test";

import { createFenghuang, InMemoryStorageAdapter } from "../src/index.ts";
import type { LLMPort } from "../src/ports/llm.ts";

const mockLLM: LLMPort = {
	chat: async () => "mock",
	chatStructured: async <T>(_msgs: unknown[], schema: { parse: (d: unknown) => T }) =>
		schema.parse({}),
	embed: async () => [0.1],
};

describe("createFenghuang", () => {
	test("returns object with all services", () => {
		const f = createFenghuang({ llm: mockLLM, storage: new InMemoryStorageAdapter() });
		expect(f.segmenter).toBeDefined();
		expect(f.episodic).toBeDefined();
		expect(f.consolidation).toBeDefined();
		expect(f.retrieval).toBeDefined();
	});
});
