import { beforeEach, describe, expect, test } from "bun:test";

import { InMemoryStorageAdapter } from "../../../src/adapters/storage/in-memory.ts";
import { createEpisode } from "../../../src/core/domain/episode.ts";
import { createFact } from "../../../src/core/domain/semantic-fact.ts";
import type { ChatMessage } from "../../../src/core/domain/types.ts";

const userId = "user-1";

function makeEpisode(overrides: Record<string, unknown> = {}) {
	return createEpisode({
		userId,
		title: "Test Episode",
		summary: "A summary",
		messages: [{ role: "user", content: "hello" }] as ChatMessage[],
		embedding: [0.1, 0.2],
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
		embedding: [0.1, 0.2],
		...overrides,
	});
}

describe("InMemoryStorage — episodic memory", () => {
	let storage: InMemoryStorageAdapter;

	beforeEach(() => {
		storage = new InMemoryStorageAdapter();
	});

	test("saveEpisode and getEpisodes", async () => {
		const ep = makeEpisode();
		await storage.saveEpisode(userId, ep);
		const episodes = await storage.getEpisodes(userId);
		expect(episodes).toHaveLength(1);
		expect(episodes[0]!.id).toBe(ep.id);
	});

	test("getEpisodes filters by userId", async () => {
		const ep1 = makeEpisode({ userId: "user-1" });
		const ep2 = makeEpisode({ userId: "user-2" });
		await storage.saveEpisode("user-1", ep1);
		await storage.saveEpisode("user-2", ep2);

		const result = await storage.getEpisodes("user-1");
		expect(result).toHaveLength(1);
		expect(result[0]!.userId).toBe("user-1");
	});

	test("getEpisodeById returns the episode", async () => {
		const ep = makeEpisode();
		await storage.saveEpisode(userId, ep);
		const found = await storage.getEpisodeById(userId, ep.id);
		expect(found).not.toBeNull();
		expect(found!.id).toBe(ep.id);
	});

	test("getEpisodeById returns null for unknown id", async () => {
		const found = await storage.getEpisodeById(userId, "nonexistent");
		expect(found).toBeNull();
	});

	test("getUnconsolidatedEpisodes returns only unconsolidated", async () => {
		const ep1 = makeEpisode();
		const ep2 = makeEpisode();
		await storage.saveEpisode(userId, ep1);
		await storage.saveEpisode(userId, ep2);
		await storage.markEpisodeConsolidated(userId, ep1.id);

		const unconsolidated = await storage.getUnconsolidatedEpisodes(userId);
		expect(unconsolidated).toHaveLength(1);
		expect(unconsolidated[0]!.id).toBe(ep2.id);
	});

	test("updateEpisodeFSRS updates card parameters", async () => {
		const ep = makeEpisode();
		await storage.saveEpisode(userId, ep);

		const now = new Date();
		await storage.updateEpisodeFSRS(userId, ep.id, {
			stability: 5.0,
			difficulty: 0.8,
			lastReviewedAt: now,
		});

		const updated = await storage.getEpisodeById(userId, ep.id);
		expect(updated!.stability).toBe(5.0);
		expect(updated!.difficulty).toBe(0.8);
		expect(updated!.lastReviewedAt).toEqual(now);
	});

	test("markEpisodeConsolidated sets consolidatedAt", async () => {
		const ep = makeEpisode();
		await storage.saveEpisode(userId, ep);
		expect(ep.consolidatedAt).toBeNull();

		await storage.markEpisodeConsolidated(userId, ep.id);
		const updated = await storage.getEpisodeById(userId, ep.id);
		expect(updated!.consolidatedAt).not.toBeNull();
		expect(updated!.consolidatedAt).toBeInstanceOf(Date);
	});

	test("saveEpisode throws on userId mismatch", async () => {
		const ep = makeEpisode({ userId: "user-1" });
		await expect(storage.saveEpisode("user-2", ep)).rejects.toThrow("does not match");
	});
});

describe("InMemoryStorage — tenant isolation (episodes)", () => {
	let storage: InMemoryStorageAdapter;

	beforeEach(() => {
		storage = new InMemoryStorageAdapter();
	});

	test("getEpisodeById cannot access other user's episode", async () => {
		const ep = makeEpisode({ userId: "user-1" });
		await storage.saveEpisode("user-1", ep);
		const found = await storage.getEpisodeById("user-2", ep.id);
		expect(found).toBeNull();
	});

	test("updateEpisodeFSRS does not affect other user's episode", async () => {
		const ep = makeEpisode({ userId: "user-1" });
		await storage.saveEpisode("user-1", ep);
		await storage.updateEpisodeFSRS("user-2", ep.id, {
			stability: 99,
			difficulty: 99,
			lastReviewedAt: new Date(),
		});
		const found = await storage.getEpisodeById("user-1", ep.id);
		expect(found!.stability).not.toBe(99);
	});

	test("markEpisodeConsolidated does not affect other user's episode", async () => {
		const ep = makeEpisode({ userId: "user-1" });
		await storage.saveEpisode("user-1", ep);
		await storage.markEpisodeConsolidated("user-2", ep.id);
		const found = await storage.getEpisodeById("user-1", ep.id);
		expect(found!.consolidatedAt).toBeNull();
	});
});

describe("InMemoryStorage — semantic memory", () => {
	let storage: InMemoryStorageAdapter;

	beforeEach(() => {
		storage = new InMemoryStorageAdapter();
	});

	test("saveFact and getFacts", async () => {
		const fact = makeFact();
		await storage.saveFact(userId, fact);
		const facts = await storage.getFacts(userId);
		expect(facts).toHaveLength(1);
		expect(facts[0]!.id).toBe(fact.id);
	});

	test("getFacts excludes invalidated facts", async () => {
		const fact = makeFact();
		await storage.saveFact(userId, fact);
		await storage.invalidateFact(userId, fact.id, new Date());

		const facts = await storage.getFacts(userId);
		expect(facts).toHaveLength(0);
	});

	test("getFactsByCategory filters by category", async () => {
		const pref = makeFact({ category: "preference" });
		const goal = makeFact({ category: "goal" });
		await storage.saveFact(userId, pref);
		await storage.saveFact(userId, goal);

		const prefs = await storage.getFactsByCategory(userId, "preference");
		expect(prefs).toHaveLength(1);
		expect(prefs[0]!.category).toBe("preference");
	});

	test("invalidateFact sets invalidAt", async () => {
		const fact = makeFact();
		await storage.saveFact(userId, fact);

		const invalidAt = new Date("2026-06-01T00:00:00Z");
		await storage.invalidateFact(userId, fact.id, invalidAt);

		const facts = await storage.getFacts(userId);
		expect(facts).toHaveLength(0);
	});

	test("updateFact applies partial updates", async () => {
		const fact = makeFact();
		await storage.saveFact(userId, fact);

		await storage.updateFact(userId, fact.id, { fact: "Loves TypeScript" });

		const facts = await storage.getFacts(userId);
		expect(facts[0]!.fact).toBe("Loves TypeScript");
		expect(facts[0]!.category).toBe("preference");
	});

	test("saveFact throws on userId mismatch", async () => {
		const fact = makeFact({ userId: "user-1" });
		await expect(storage.saveFact("user-2", fact)).rejects.toThrow("does not match");
	});
});

describe("InMemoryStorage — tenant isolation (facts)", () => {
	let storage: InMemoryStorageAdapter;

	beforeEach(() => {
		storage = new InMemoryStorageAdapter();
	});

	test("invalidateFact does not affect other user's fact", async () => {
		const fact = makeFact({ userId: "user-1" });
		await storage.saveFact("user-1", fact);
		await storage.invalidateFact("user-2", fact.id, new Date());

		const facts = await storage.getFacts("user-1");
		expect(facts).toHaveLength(1);
	});

	test("updateFact does not affect other user's fact", async () => {
		const fact = makeFact({ userId: "user-1" });
		await storage.saveFact("user-1", fact);
		await storage.updateFact("user-2", fact.id, { fact: "Hacked!" });

		const facts = await storage.getFacts("user-1");
		expect(facts[0]!.fact).toBe("Likes TypeScript");
	});
});

describe("InMemoryStorage — message queue", () => {
	let storage: InMemoryStorageAdapter;

	beforeEach(() => {
		storage = new InMemoryStorageAdapter();
	});

	test("pushMessage and getMessageQueue", async () => {
		const msg: ChatMessage = { role: "user", content: "hello" };
		await storage.pushMessage(userId, msg);

		const queue = await storage.getMessageQueue(userId);
		expect(queue).toHaveLength(1);
		expect(queue[0]!.content).toBe("hello");
	});

	test("pushMessage appends to existing queue", async () => {
		await storage.pushMessage(userId, { role: "user", content: "first" });
		await storage.pushMessage(userId, { role: "assistant", content: "second" });

		const queue = await storage.getMessageQueue(userId);
		expect(queue).toHaveLength(2);
		expect(queue[0]!.content).toBe("first");
		expect(queue[1]!.content).toBe("second");
	});

	test("getMessageQueue returns empty array for unknown user", async () => {
		const queue = await storage.getMessageQueue("unknown-user");
		expect(queue).toHaveLength(0);
	});

	test("clearMessageQueue removes all messages", async () => {
		await storage.pushMessage(userId, { role: "user", content: "hello" });
		await storage.clearMessageQueue(userId);

		const queue = await storage.getMessageQueue(userId);
		expect(queue).toHaveLength(0);
	});
});

describe("InMemoryStorage — tenant isolation (message queue)", () => {
	let storage: InMemoryStorageAdapter;

	beforeEach(() => {
		storage = new InMemoryStorageAdapter();
	});

	test("getMessageQueue does not return other user's messages", async () => {
		await storage.pushMessage("user-1", { role: "user", content: "msg-1" });
		await storage.pushMessage("user-2", { role: "user", content: "msg-2" });

		const queue = await storage.getMessageQueue("user-1");
		expect(queue).toHaveLength(1);
		expect(queue[0]!.content).toBe("msg-1");
	});

	test("clearMessageQueue does not affect other user's messages", async () => {
		await storage.pushMessage("user-1", { role: "user", content: "msg-1" });
		await storage.pushMessage("user-2", { role: "user", content: "msg-2" });

		await storage.clearMessageQueue("user-1");

		const q1 = await storage.getMessageQueue("user-1");
		const q2 = await storage.getMessageQueue("user-2");
		expect(q1).toHaveLength(0);
		expect(q2).toHaveLength(1);
		expect(q2[0]!.content).toBe("msg-2");
	});
});

describe("InMemoryStorage — search episodes", () => {
	let storage: InMemoryStorageAdapter;

	beforeEach(() => {
		storage = new InMemoryStorageAdapter();
	});

	test("matches title", async () => {
		const ep = makeEpisode({ title: "TypeScript Discussion" });
		await storage.saveEpisode(userId, ep);

		const results = await storage.searchEpisodes(userId, "typescript", 10);
		expect(results).toHaveLength(1);
	});

	test("matches summary", async () => {
		const ep = makeEpisode({ summary: "Talked about Bun runtime" });
		await storage.saveEpisode(userId, ep);

		const results = await storage.searchEpisodes(userId, "bun", 10);
		expect(results).toHaveLength(1);
	});

	test("is case-insensitive", async () => {
		const ep = makeEpisode({ title: "UPPERCASE Title" });
		await storage.saveEpisode(userId, ep);

		const results = await storage.searchEpisodes(userId, "uppercase", 10);
		expect(results).toHaveLength(1);
	});

	test("respects limit", async () => {
		await Promise.all(
			Array.from({ length: 5 }, (_, i) =>
				storage.saveEpisode(userId, makeEpisode({ title: `Episode ${i}` })),
			),
		);

		const results = await storage.searchEpisodes(userId, "episode", 3);
		expect(results).toHaveLength(3);
	});

	test("filters by userId", async () => {
		await storage.saveEpisode("user-1", makeEpisode({ userId: "user-1", title: "Shared" }));
		await storage.saveEpisode("user-2", makeEpisode({ userId: "user-2", title: "Shared" }));

		const results = await storage.searchEpisodes("user-1", "shared", 10);
		expect(results).toHaveLength(1);
	});

	test("clamps search limit", async () => {
		await storage.saveEpisode(userId, makeEpisode({ title: "Test" }));

		const results = await storage.searchEpisodes(userId, "test", -5);
		expect(results).toHaveLength(1);
	});
});

describe("InMemoryStorage — search facts", () => {
	let storage: InMemoryStorageAdapter;

	beforeEach(() => {
		storage = new InMemoryStorageAdapter();
	});

	test("matches fact content", async () => {
		const fact = makeFact({ fact: "Prefers dark mode" });
		await storage.saveFact(userId, fact);

		const results = await storage.searchFacts(userId, "dark mode", 10);
		expect(results).toHaveLength(1);
	});

	test("matches keywords", async () => {
		const fact = makeFact({ keywords: ["vim", "editor"] });
		await storage.saveFact(userId, fact);

		const results = await storage.searchFacts(userId, "vim", 10);
		expect(results).toHaveLength(1);
	});

	test("excludes invalidated facts", async () => {
		const fact = makeFact({ fact: "Old preference" });
		await storage.saveFact(userId, fact);
		await storage.invalidateFact(userId, fact.id, new Date());

		const results = await storage.searchFacts(userId, "old", 10);
		expect(results).toHaveLength(0);
	});

	test("respects limit", async () => {
		await Promise.all(
			Array.from({ length: 5 }, (_, i) =>
				storage.saveFact(userId, makeFact({ fact: `Fact number ${i}` })),
			),
		);

		const results = await storage.searchFacts(userId, "fact", 3);
		expect(results).toHaveLength(3);
	});

	test("clamps search limit", async () => {
		await storage.saveFact(userId, makeFact({ fact: "Test fact" }));

		const results = await storage.searchFacts(userId, "test", -5);
		expect(results).toHaveLength(1);
	});
});
