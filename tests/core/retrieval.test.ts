import { beforeEach, describe, expect, test } from "bun:test";

import { InMemoryStorageAdapter } from "../../src/adapters/storage/in-memory.ts";
import { createEpisode } from "../../src/core/domain/episode.ts";
import { createFact } from "../../src/core/domain/semantic-fact.ts";
import type { ChatMessage } from "../../src/core/domain/types.ts";
import { Retrieval, reciprocalRankFusion } from "../../src/core/retrieval.ts";
import type { LLMPort } from "../../src/ports/llm.ts";

const userId = "user-1";

/** Mock LLM that returns a fixed embedding */
function mockLlm(embedding: number[]): LLMPort {
	return {
		chat: async () => "",
		chatStructured: async <T>(_: ChatMessage[], schema: { parse: (d: unknown) => T }) =>
			schema.parse({}),
		embed: async () => embedding,
	};
}

function makeEpisode(overrides: Record<string, unknown> = {}) {
	return createEpisode({
		userId,
		title: "Test Episode",
		summary: "A summary",
		messages: [{ role: "user", content: "hello" }] as ChatMessage[],
		embedding: [0.1, 0.2, 0.3],
		surprise: 0.5,
		startAt: new Date("2026-01-01T00:00:00Z"),
		endAt: new Date("2026-01-01T01:00:00Z"),
		...overrides,
	});
}

function makeFact(overrides: Record<string, unknown> = {}) {
	return createFact({
		userId,
		category: "preference",
		fact: "Likes TypeScript",
		keywords: ["typescript"],
		sourceEpisodicIds: ["ep-1"],
		embedding: [0.1, 0.2, 0.3],
		...overrides,
	});
}

// --- reciprocalRankFusion unit tests ---

describe("reciprocalRankFusion", () => {
	test("single list scores by rank", () => {
		const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
		const scores = reciprocalRankFusion([{ items, weight: 1.0 }], (x) => x.id);

		expect(scores.get("a")).toBeGreaterThan(scores.get("b")!);
		expect(scores.get("b")).toBeGreaterThan(scores.get("c")!);
	});

	test("items in both lists get higher score", () => {
		const list1 = [{ id: "a" }, { id: "b" }];
		const list2 = [{ id: "b" }, { id: "c" }];
		const scores = reciprocalRankFusion(
			[
				{ items: list1, weight: 1.0 },
				{ items: list2, weight: 1.0 },
			],
			(x) => x.id,
		);

		expect(scores.get("b")).toBeGreaterThan(scores.get("a")!);
		expect(scores.get("b")).toBeGreaterThan(scores.get("c")!);
	});

	test("weight affects score contribution", () => {
		const items = [{ id: "a" }];
		const scores1 = reciprocalRankFusion([{ items, weight: 1.0 }], (x) => x.id);
		const scores2 = reciprocalRankFusion([{ items, weight: 2.0 }], (x) => x.id);

		expect(scores2.get("a")!).toBeCloseTo(scores1.get("a")! * 2);
	});

	test("empty lists return empty map", () => {
		const scores = reciprocalRankFusion(
			[{ items: [] as { id: string }[], weight: 1.0 }],
			(x) => x.id,
		);
		expect(scores.size).toBe(0);
	});
});

// --- Retrieval service tests ---

describe("Retrieval — text-only match", () => {
	let storage: InMemoryStorageAdapter;
	let retrieval: Retrieval;

	beforeEach(() => {
		storage = new InMemoryStorageAdapter();
		// Embedding that doesn't match any stored episodes
		retrieval = new Retrieval(mockLlm([0, 0, 1]), storage);
	});

	test("returns episode found by text search", async () => {
		const ep = makeEpisode({ title: "TypeScript Discussion", embedding: [1, 0, 0] });
		await storage.saveEpisode(userId, ep);

		const result = await retrieval.retrieve(userId, "TypeScript");
		expect(result.episodes).toHaveLength(1);
		expect(result.episodes[0]!.episode.id).toBe(ep.id);
		expect(result.episodes[0]!.score).toBeGreaterThan(0);
	});

	test("returns fact found by text search", async () => {
		const fact = makeFact({ fact: "Prefers dark mode", embedding: [1, 0, 0] });
		await storage.saveFact(userId, fact);

		const result = await retrieval.retrieve(userId, "dark mode");
		expect(result.facts).toHaveLength(1);
		expect(result.facts[0]!.fact.id).toBe(fact.id);
	});
});

describe("Retrieval — vector-only match", () => {
	let storage: InMemoryStorageAdapter;
	let retrieval: Retrieval;

	beforeEach(() => {
		storage = new InMemoryStorageAdapter();
		// Embedding close to [1, 0, 0]
		retrieval = new Retrieval(mockLlm([1, 0, 0]), storage);
	});

	test("returns episode found by vector similarity", async () => {
		// Title won't match text "xyz", but embedding will match
		const ep = makeEpisode({ title: "Unrelated Title", embedding: [1, 0, 0] });
		await storage.saveEpisode(userId, ep);

		const result = await retrieval.retrieve(userId, "xyz");
		expect(result.episodes).toHaveLength(1);
		expect(result.episodes[0]!.episode.id).toBe(ep.id);
	});

	test("returns fact found by vector similarity", async () => {
		const fact = makeFact({ fact: "Unrelated text", embedding: [1, 0, 0] });
		await storage.saveFact(userId, fact);

		const result = await retrieval.retrieve(userId, "xyz");
		expect(result.facts).toHaveLength(1);
		expect(result.facts[0]!.fact.id).toBe(fact.id);
	});
});

describe("Retrieval — hybrid score combination", () => {
	let storage: InMemoryStorageAdapter;
	let retrieval: Retrieval;

	beforeEach(() => {
		storage = new InMemoryStorageAdapter();
		retrieval = new Retrieval(mockLlm([1, 0, 0]), storage);
	});

	test("episode matching both text and vector scores higher", async () => {
		// Matches both text and vector
		const epBoth = makeEpisode({ title: "TypeScript Guide", embedding: [1, 0, 0] });
		// Matches text only
		const epText = makeEpisode({ title: "TypeScript Intro", embedding: [0, 0, 1] });
		await storage.saveEpisode(userId, epBoth);
		await storage.saveEpisode(userId, epText);

		const result = await retrieval.retrieve(userId, "TypeScript");
		expect(result.episodes).toHaveLength(2);
		expect(result.episodes[0]!.episode.id).toBe(epBoth.id);
		expect(result.episodes[0]!.score).toBeGreaterThan(result.episodes[1]!.score);
	});
});

describe("Retrieval — FSRS retrievability", () => {
	let storage: InMemoryStorageAdapter;
	let retrieval: Retrieval;

	beforeEach(() => {
		storage = new InMemoryStorageAdapter();
		retrieval = new Retrieval(mockLlm([1, 0, 0]), storage);
	});

	test("fresh episode has higher score than decayed episode", async () => {
		const now = new Date("2026-06-01T00:00:00Z");

		// Recently reviewed episode (high retrievability)
		const epFresh = makeEpisode({ title: "TypeScript Fresh", embedding: [1, 0, 0] });
		await storage.saveEpisode(userId, epFresh);
		await storage.updateEpisodeFSRS(userId, epFresh.id, {
			stability: 1.0,
			difficulty: 0.3,
			lastReviewedAt: new Date("2026-05-31T00:00:00Z"),
		});

		// Old episode (low retrievability)
		const epOld = makeEpisode({ title: "TypeScript Old", embedding: [1, 0, 0] });
		await storage.saveEpisode(userId, epOld);
		await storage.updateEpisodeFSRS(userId, epOld.id, {
			stability: 1.0,
			difficulty: 0.3,
			lastReviewedAt: new Date("2026-01-01T00:00:00Z"),
		});

		const result = await retrieval.retrieve(userId, "TypeScript", { now });
		expect(result.episodes).toHaveLength(2);
		expect(result.episodes[0]!.retrievability).toBeGreaterThan(result.episodes[1]!.retrievability);
	});
});

describe("Retrieval — edge cases", () => {
	let storage: InMemoryStorageAdapter;
	let retrieval: Retrieval;

	beforeEach(() => {
		storage = new InMemoryStorageAdapter();
		retrieval = new Retrieval(mockLlm([1, 0, 0]), storage);
	});

	test("empty results when no data", async () => {
		const result = await retrieval.retrieve(userId, "anything");
		expect(result.episodes).toHaveLength(0);
		expect(result.facts).toHaveLength(0);
	});

	test("tenant isolation — does not return other user data", async () => {
		const ep = makeEpisode({ userId: "user-2", title: "TypeScript", embedding: [1, 0, 0] });
		await storage.saveEpisode("user-2", ep);

		const result = await retrieval.retrieve(userId, "TypeScript");
		expect(result.episodes).toHaveLength(0);
	});

	test("respects limit option", async () => {
		for (let i = 0; i < 5; i++) {
			await storage.saveEpisode(
				userId,
				makeEpisode({ title: `Episode ${i}`, embedding: [1, 0, 0] }),
			);
		}
		const result = await retrieval.retrieve(userId, "Episode", { limit: 2 });
		expect(result.episodes).toHaveLength(2);
	});

	test("throws on empty userId", async () => {
		await expect(retrieval.retrieve("", "query")).rejects.toThrow("userId must not be empty");
	});
});
