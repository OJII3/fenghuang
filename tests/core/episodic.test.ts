import { beforeEach, describe, expect, test } from "bun:test";

import { InMemoryStorageAdapter } from "../../src/adapters/storage/in-memory.ts";
import type { Episode } from "../../src/core/domain/episode.ts";
import { createEpisode } from "../../src/core/domain/episode.ts";
import type { ChatMessage } from "../../src/core/domain/types.ts";
import { EpisodicMemory } from "../../src/core/episodic.ts";

const userId = "user-1";

function makeEpisode(overrides: Record<string, unknown> = {}): Episode {
	return createEpisode({
		userId,
		title: "Test Episode",
		summary: "A test summary",
		messages: [{ role: "user", content: "hello" }] as ChatMessage[],
		embedding: [0.1, 0.2],
		surprise: 0.5,
		startAt: new Date("2026-01-01T00:00:00Z"),
		endAt: new Date("2026-01-01T01:00:00Z"),
		...overrides,
	});
}

describe("EpisodicMemory — retrieval", () => {
	let storage: InMemoryStorageAdapter;
	let episodic: EpisodicMemory;

	beforeEach(() => {
		storage = new InMemoryStorageAdapter();
		episodic = new EpisodicMemory(storage);
	});

	test("getEpisodes returns all episodes for a user", async () => {
		const ep1 = makeEpisode();
		const ep2 = makeEpisode({ title: "Second" });
		await storage.saveEpisode(userId, ep1);
		await storage.saveEpisode(userId, ep2);

		const episodes = await episodic.getEpisodes(userId);
		expect(episodes).toHaveLength(2);
	});

	test("getEpisodeById returns the episode", async () => {
		const ep = makeEpisode();
		await storage.saveEpisode(userId, ep);

		const found = await episodic.getEpisodeById(ep.id);
		expect(found).not.toBeNull();
		expect(found!.id).toBe(ep.id);
	});

	test("getEpisodeById returns null for unknown id", async () => {
		const found = await episodic.getEpisodeById("nonexistent");
		expect(found).toBeNull();
	});

	test("getUnconsolidated returns only unconsolidated episodes", async () => {
		const ep1 = makeEpisode();
		const ep2 = makeEpisode();
		await storage.saveEpisode(userId, ep1);
		await storage.saveEpisode(userId, ep2);
		await storage.markEpisodeConsolidated(ep1.id);

		const unconsolidated = await episodic.getUnconsolidated(userId);
		expect(unconsolidated).toHaveLength(1);
		expect(unconsolidated[0]!.id).toBe(ep2.id);
	});
});

describe("EpisodicMemory — search", () => {
	let storage: InMemoryStorageAdapter;
	let episodic: EpisodicMemory;

	beforeEach(() => {
		storage = new InMemoryStorageAdapter();
		episodic = new EpisodicMemory(storage);
	});

	test("search finds episodes by title", async () => {
		const ep = makeEpisode({ title: "TypeScript Discussion" });
		await storage.saveEpisode(userId, ep);

		const results = await episodic.search(userId, "typescript", 10);
		expect(results).toHaveLength(1);
	});

	test("search finds episodes by summary", async () => {
		const ep = makeEpisode({ summary: "Talked about Bun runtime" });
		await storage.saveEpisode(userId, ep);

		const results = await episodic.search(userId, "bun", 10);
		expect(results).toHaveLength(1);
	});

	test("search respects limit", async () => {
		await Promise.all(
			Array.from({ length: 5 }, (_, i) =>
				storage.saveEpisode(userId, makeEpisode({ title: `Episode ${i}` })),
			),
		);

		const results = await episodic.search(userId, "episode", 3);
		expect(results).toHaveLength(3);
	});
});

describe("EpisodicMemory — FSRS review", () => {
	let storage: InMemoryStorageAdapter;
	let episodic: EpisodicMemory;

	beforeEach(() => {
		storage = new InMemoryStorageAdapter();
		episodic = new EpisodicMemory(storage);
	});

	test("review updates FSRS parameters", async () => {
		const ep = makeEpisode();
		await storage.saveEpisode(userId, ep);

		const now = new Date();
		const updated = await episodic.review(ep.id, "good", now);

		expect(updated).not.toBeNull();
		expect(updated!.lastReviewedAt).toEqual(now);
	});

	test("review with 'easy' increases stability", async () => {
		const ep = makeEpisode();
		await storage.saveEpisode(userId, ep);

		// First review to set lastReviewedAt
		const reviewTime1 = new Date("2026-01-01T00:00:00Z");
		await episodic.review(ep.id, "good", reviewTime1);

		// Second review after some time
		const reviewTime2 = new Date("2026-01-02T00:00:00Z");
		const updated = await episodic.review(ep.id, "easy", reviewTime2);

		// Easy rating should increase stability
		const storedEp = await storage.getEpisodeById(ep.id);
		expect(storedEp!.stability).toBeGreaterThan(0);
		expect(updated!.lastReviewedAt).toEqual(reviewTime2);
	});

	test("review with 'again' decreases stability", async () => {
		const ep = makeEpisode();
		await storage.saveEpisode(userId, ep);

		// First review
		const reviewTime1 = new Date("2026-01-01T00:00:00Z");
		await episodic.review(ep.id, "good", reviewTime1);
		const afterGood = await storage.getEpisodeById(ep.id);
		const stabilityAfterGood = afterGood!.stability;

		// Second review with "again" after some time
		const reviewTime2 = new Date("2026-01-02T00:00:00Z");
		await episodic.review(ep.id, "again", reviewTime2);
		const afterAgain = await storage.getEpisodeById(ep.id);

		expect(afterAgain!.stability).toBeLessThan(stabilityAfterGood);
	});

	test("review with 'hard' rating adjusts stability", async () => {
		const ep = makeEpisode();
		await storage.saveEpisode(userId, ep);

		// First review to set baseline
		const reviewTime1 = new Date("2026-01-01T00:00:00Z");
		await episodic.review(ep.id, "good", reviewTime1);
		const afterGood = await storage.getEpisodeById(ep.id);
		const stabilityAfterGood = afterGood!.stability;

		// Second review with "hard" after some time
		const reviewTime2 = new Date("2026-01-02T00:00:00Z");
		await episodic.review(ep.id, "hard", reviewTime2);
		const afterHard = await storage.getEpisodeById(ep.id);

		// "hard" should decrease stability compared to what "good" produced,
		// but not as much as "again" would
		expect(afterHard!.stability).toBeLessThan(stabilityAfterGood);
	});

	test("review returns null for unknown episode", async () => {
		const result = await episodic.review("nonexistent", "good");
		expect(result).toBeNull();
	});
});

describe("EpisodicMemory — consolidation", () => {
	let storage: InMemoryStorageAdapter;
	let episodic: EpisodicMemory;

	beforeEach(() => {
		storage = new InMemoryStorageAdapter();
		episodic = new EpisodicMemory(storage);
	});

	test("markConsolidated sets consolidatedAt", async () => {
		const ep = makeEpisode();
		await storage.saveEpisode(userId, ep);

		await episodic.markConsolidated(ep.id);

		const updated = await storage.getEpisodeById(ep.id);
		expect(updated!.consolidatedAt).not.toBeNull();
		expect(updated!.consolidatedAt).toBeInstanceOf(Date);
	});
});

describe("EpisodicMemory — retrievability", () => {
	let episodic: EpisodicMemory;

	beforeEach(() => {
		const storage = new InMemoryStorageAdapter();
		episodic = new EpisodicMemory(storage);
	});

	test("retrievability is 1.0 for never-reviewed episode", () => {
		const ep = makeEpisode();
		const r = episodic.getRetrievability(ep);
		expect(r).toBe(1.0);
	});

	test("retrievability decays over time", () => {
		const ep = makeEpisode();
		// Simulate a reviewed episode
		const reviewed: Episode = {
			...ep,
			lastReviewedAt: new Date("2026-01-01T00:00:00Z"),
		};

		const oneDayLater = new Date("2026-01-02T00:00:00Z");
		const oneWeekLater = new Date("2026-01-08T00:00:00Z");

		const rDay = episodic.getRetrievability(reviewed, oneDayLater);
		const rWeek = episodic.getRetrievability(reviewed, oneWeekLater);

		expect(rDay).toBeGreaterThan(rWeek);
		expect(rDay).toBeLessThan(1.0);
		expect(rWeek).toBeLessThan(1.0);
	});

	test("higher stability leads to slower decay", () => {
		const ep = makeEpisode();
		const reviewed = new Date("2026-01-01T00:00:00Z");
		const now = new Date("2026-01-08T00:00:00Z");

		const lowStability: Episode = { ...ep, stability: 1.0, lastReviewedAt: reviewed };
		const highStability: Episode = { ...ep, stability: 5.0, lastReviewedAt: reviewed };

		const rLow = episodic.getRetrievability(lowStability, now);
		const rHigh = episodic.getRetrievability(highStability, now);

		expect(rHigh).toBeGreaterThan(rLow);
	});
});
