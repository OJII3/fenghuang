import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { SQLiteStorageAdapter } from "../../src/adapters/storage/sqlite.ts";
import type { ChatMessage } from "../../src/core/domain/types.ts";
import { SURPRISE_VALUES } from "../../src/core/domain/types.ts";
import { EpisodicMemory } from "../../src/core/episodic.ts";
import type { SegmentationOutput } from "../../src/core/segmenter.ts";
import { Segmenter } from "../../src/core/segmenter.ts";
import type { LLMPort, Schema } from "../../src/ports/llm.ts";

const userId = "user-1";

function createMockLLM(segmentationResponse?: SegmentationOutput): LLMPort {
	return {
		async chat(_messages: ChatMessage[]): Promise<string> {
			return "mock response";
		},
		async chatStructured<T>(_messages: ChatMessage[], schema: Schema<T>): Promise<T> {
			const response = segmentationResponse ?? { segments: [] };
			return schema.parse(response);
		},
		async embed(_text: string): Promise<number[]> {
			return [0.1, 0.2, 0.3];
		},
	};
}

function makeMessage(content: string, role: ChatMessage["role"] = "user"): ChatMessage {
	return { role, content, timestamp: new Date() };
}

/** Add messages sequentially (order-dependent — each addMessage may trigger segmentation) */
async function addMessagesSequentially(
	segmenter: Segmenter,
	count: number,
	roleFn: (i: number) => ChatMessage["role"] = () => "user",
): Promise<void> {
	for (let i = 0; i < count; i++) {
		// eslint-disable-next-line no-await-in-loop -- order-dependent: each addMessage checks thresholds
		await segmenter.addMessage(userId, makeMessage(`message ${i}`, roleFn(i)));
	}
}

describe("Integration: Segmenter + SQLite + EpisodicMemory", () => {
	let storage: SQLiteStorageAdapter;

	beforeEach(() => {
		storage = new SQLiteStorageAdapter(":memory:");
	});

	afterEach(() => {
		storage.close();
	});

	test("full flow: addMessage → segmentation → episode saved in SQLite → retrievable via EpisodicMemory", async () => {
		const segResponse: SegmentationOutput = {
			segments: [
				{
					startIndex: 0,
					endIndex: 5,
					title: "Integration Test Topic",
					summary: "Testing the full pipeline with SQLite storage",
					surprise: "high",
				},
			],
		};

		const llm = createMockLLM(segResponse);
		const segmenter = new Segmenter(llm, storage, {
			minMessages: 3,
			softTrigger: 5,
			hardTrigger: 20,
		});
		const episodic = new EpisodicMemory(storage);

		await addMessagesSequentially(segmenter, 5, (i) => (i % 2 === 0 ? "user" : "assistant"));

		// Verify episode was saved to SQLite and retrievable
		const episodes = await episodic.getEpisodes(userId);
		expect(episodes).toHaveLength(1);

		const ep = episodes[0]!;
		expect(ep.title).toBe("Integration Test Topic");
		expect(ep.summary).toBe("Testing the full pipeline with SQLite storage");
		expect(ep.surprise).toBe(SURPRISE_VALUES.high);
		expect(ep.messages).toHaveLength(5);
		expect(ep.embedding).toEqual([0.1, 0.2, 0.3]);
	});

	test("episode is searchable after segmentation", async () => {
		const segResponse: SegmentationOutput = {
			segments: [
				{
					startIndex: 0,
					endIndex: 5,
					title: "TypeScript Best Practices",
					summary: "Discussion about TypeScript coding standards",
					surprise: "low",
				},
			],
		};

		const segmenter = new Segmenter(createMockLLM(segResponse), storage, {
			minMessages: 3,
			softTrigger: 5,
			hardTrigger: 20,
		});
		const episodic = new EpisodicMemory(storage);

		await addMessagesSequentially(segmenter, 5);

		const results = await episodic.search(userId, "typescript", 10);
		expect(results).toHaveLength(1);
		expect(results[0]!.title).toBe("TypeScript Best Practices");
	});

	test("FSRS review works on SQLite-stored episode", async () => {
		const segResponse: SegmentationOutput = {
			segments: [
				{
					startIndex: 0,
					endIndex: 5,
					title: "FSRS Test",
					summary: "Testing FSRS review on SQLite",
					surprise: "low",
				},
			],
		};

		const segmenter = new Segmenter(createMockLLM(segResponse), storage, {
			minMessages: 3,
			softTrigger: 5,
			hardTrigger: 20,
		});
		const episodic = new EpisodicMemory(storage);

		await addMessagesSequentially(segmenter, 5);

		const episodes = await episodic.getEpisodes(userId);
		const ep = episodes[0]!;

		// Review the episode
		const now = new Date();
		const card = await episodic.review(userId, ep.id, { rating: "good", now });
		expect(card).not.toBeNull();
		expect(card!.lastReviewedAt).toEqual(now);

		// Verify persistence in SQLite
		const updated = await episodic.getEpisodeById(userId, ep.id);
		expect(updated!.lastReviewedAt!.getTime()).toBe(now.getTime());
	});

	test("multiple segments create multiple episodes in SQLite", async () => {
		const segResponse: SegmentationOutput = {
			segments: [
				{
					startIndex: 0,
					endIndex: 5,
					title: "First Discussion",
					summary: "First topic discussed",
					surprise: "low",
				},
				{
					startIndex: 5,
					endIndex: 10,
					title: "Second Discussion",
					summary: "Second topic discussed",
					surprise: "extremely_high",
				},
			],
		};

		const segmenter = new Segmenter(createMockLLM(segResponse), storage, {
			minMessages: 3,
			softTrigger: 10,
			hardTrigger: 20,
		});
		const episodic = new EpisodicMemory(storage);

		await addMessagesSequentially(segmenter, 10);

		const episodes = await episodic.getEpisodes(userId);
		expect(episodes).toHaveLength(2);

		// Check surprise values are correct
		const surprises = episodes.map((e) => e.surprise).toSorted();
		expect(surprises).toContain(SURPRISE_VALUES.low);
		expect(surprises).toContain(SURPRISE_VALUES.extremely_high);
	});

	test("remaining messages stay in SQLite queue after partial segmentation", async () => {
		const segResponse: SegmentationOutput = {
			segments: [
				{
					startIndex: 0,
					endIndex: 6,
					title: "Partial Segment",
					summary: "Only first 6 messages",
					surprise: "low",
				},
			],
		};

		const segmenter = new Segmenter(createMockLLM(segResponse), storage, {
			minMessages: 3,
			softTrigger: 10,
			hardTrigger: 20,
		});

		await addMessagesSequentially(segmenter, 10);

		// 4 remaining messages should persist in SQLite queue
		const queue = await storage.getMessageQueue(userId);
		expect(queue).toHaveLength(4);
		expect(queue[0]!.content).toBe("message 6");
	});

	test("consolidation marking persists in SQLite", async () => {
		const segResponse: SegmentationOutput = {
			segments: [
				{
					startIndex: 0,
					endIndex: 5,
					title: "Consolidation Test",
					summary: "Testing consolidation mark",
					surprise: "low",
				},
			],
		};

		const segmenter = new Segmenter(createMockLLM(segResponse), storage, {
			minMessages: 3,
			softTrigger: 5,
			hardTrigger: 20,
		});
		const episodic = new EpisodicMemory(storage);

		await addMessagesSequentially(segmenter, 5);

		const episodes = await episodic.getEpisodes(userId);
		await episodic.markConsolidated(userId, episodes[0]!.id);

		const unconsolidated = await episodic.getUnconsolidated(userId);
		expect(unconsolidated).toHaveLength(0);

		const consolidated = await episodic.getEpisodeById(userId, episodes[0]!.id);
		expect(consolidated!.consolidatedAt).not.toBeNull();
	});
});
