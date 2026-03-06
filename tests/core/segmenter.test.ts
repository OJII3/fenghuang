import { beforeEach, describe, expect, test } from "bun:test";
import { InMemoryStorageAdapter } from "../../src/adapters/storage/in-memory.ts";
import type { Episode } from "../../src/core/domain/episode.ts";
import type { ChatMessage, SurpriseLevel } from "../../src/core/domain/types.ts";
import { SURPRISE_VALUES } from "../../src/core/domain/types.ts";
import { Segmenter } from "../../src/core/segmenter.ts";
import type { SegmentationOutput } from "../../src/core/segmenter.ts";
import type { LLMPort, Schema } from "../../src/ports/llm.ts";

// --- Mock LLMPort ---

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

function makeMessages(count: number): ChatMessage[] {
	return Array.from({ length: count }, (_, i) =>
		makeMessage(`message ${i}`, i % 2 === 0 ? "user" : "assistant"),
	);
}

const userId = "user-1";

describe("Segmenter — threshold checks", () => {
	let storage: InMemoryStorageAdapter;

	beforeEach(() => {
		storage = new InMemoryStorageAdapter();
	});

	test("below softTrigger returns no episodes", async () => {
		const segmenter = new Segmenter(createMockLLM(), storage, {
			minMessages: 5,
			softTrigger: 20,
			hardTrigger: 40,
		});

		// Add 10 messages (below softTrigger of 20)
		for (const msg of makeMessages(10)) {
			const episodes = await segmenter.addMessage(userId, msg);
			expect(episodes).toHaveLength(0);
		}

		// Queue should still have all messages
		const queue = await storage.getMessageQueue(userId);
		expect(queue).toHaveLength(10);
	});

	test("softTrigger reached triggers LLM segmentation", async () => {
		const segResponse: SegmentationOutput = {
			segments: [
				{
					startIndex: 0,
					endIndex: 10,
					title: "First topic",
					summary: "Discussion about first topic",
					surprise: "low",
				},
			],
		};

		const segmenter = new Segmenter(createMockLLM(segResponse), storage, {
			minMessages: 3,
			softTrigger: 10,
			hardTrigger: 20,
		});

		// Add 9 messages (below softTrigger)
		for (const msg of makeMessages(9)) {
			await segmenter.addMessage(userId, msg);
		}

		// 10th message should trigger segmentation
		const episodes = await segmenter.addMessage(userId, makeMessage("trigger"));
		expect(episodes).toHaveLength(1);
		expect(episodes[0]!.title).toBe("First topic");
	});

	test("hardTrigger forces segmentation", async () => {
		const segResponse: SegmentationOutput = {
			segments: [
				{
					startIndex: 0,
					endIndex: 5,
					title: "Forced segment",
					summary: "Forced segmentation due to hard trigger",
					surprise: "high",
				},
			],
		};

		const segmenter = new Segmenter(createMockLLM(segResponse), storage, {
			minMessages: 3,
			softTrigger: 10,
			hardTrigger: 5,
		});

		// Add 4 messages (below hardTrigger)
		for (const msg of makeMessages(4)) {
			await segmenter.addMessage(userId, msg);
		}

		// 5th message should trigger forced segmentation
		const episodes = await segmenter.addMessage(userId, makeMessage("trigger"));
		expect(episodes).toHaveLength(1);
		expect(episodes[0]!.title).toBe("Forced segment");
	});

	test("LLM returns no segments at softTrigger returns no episodes", async () => {
		const segmenter = new Segmenter(createMockLLM({ segments: [] }), storage, {
			minMessages: 3,
			softTrigger: 5,
			hardTrigger: 20,
		});

		// Add 5 messages (reaches softTrigger)
		for (const msg of makeMessages(5)) {
			await segmenter.addMessage(userId, msg);
		}

		// Queue should still have all messages since no segments detected
		const queue = await storage.getMessageQueue(userId);
		expect(queue).toHaveLength(5);
	});
});

describe("Segmenter — episode creation", () => {
	let storage: InMemoryStorageAdapter;

	beforeEach(() => {
		storage = new InMemoryStorageAdapter();
	});

	test("created episode has correct fields", async () => {
		const segResponse: SegmentationOutput = {
			segments: [
				{
					startIndex: 0,
					endIndex: 5,
					title: "Test Episode",
					summary: "Summary of the test episode",
					surprise: "high",
				},
			],
		};

		const segmenter = new Segmenter(createMockLLM(segResponse), storage, {
			minMessages: 3,
			softTrigger: 5,
			hardTrigger: 20,
		});

		for (const msg of makeMessages(5)) {
			await segmenter.addMessage(userId, msg);
		}

		const episodes = await storage.getEpisodes(userId);
		expect(episodes).toHaveLength(1);

		const ep = episodes[0]!;
		expect(ep.title).toBe("Test Episode");
		expect(ep.summary).toBe("Summary of the test episode");
		expect(ep.userId).toBe(userId);
		expect(ep.messages).toHaveLength(5);
		expect(ep.embedding).toEqual([0.1, 0.2, 0.3]);
		expect(ep.surprise).toBe(SURPRISE_VALUES.high);
	});

	test("episode is saved to storage", async () => {
		const segResponse: SegmentationOutput = {
			segments: [
				{
					startIndex: 0,
					endIndex: 5,
					title: "Saved Episode",
					summary: "This episode should be saved",
					surprise: "low",
				},
			],
		};

		const segmenter = new Segmenter(createMockLLM(segResponse), storage, {
			minMessages: 3,
			softTrigger: 5,
			hardTrigger: 20,
		});

		for (const msg of makeMessages(5)) {
			await segmenter.addMessage(userId, msg);
		}

		const ep = await storage.getEpisodes(userId);
		expect(ep).toHaveLength(1);
		expect(ep[0]!.id).toBeDefined();
	});

	test("multiple segments create multiple episodes", async () => {
		const segResponse: SegmentationOutput = {
			segments: [
				{
					startIndex: 0,
					endIndex: 5,
					title: "First topic",
					summary: "First segment",
					surprise: "low",
				},
				{
					startIndex: 5,
					endIndex: 10,
					title: "Second topic",
					summary: "Second segment",
					surprise: "extremely_high",
				},
			],
		};

		const segmenter = new Segmenter(createMockLLM(segResponse), storage, {
			minMessages: 3,
			softTrigger: 10,
			hardTrigger: 20,
		});

		for (const msg of makeMessages(10)) {
			await segmenter.addMessage(userId, msg);
		}

		const episodes = await storage.getEpisodes(userId);
		expect(episodes).toHaveLength(2);
		expect(episodes.map((e: Episode) => e.title)).toContain("First topic");
		expect(episodes.map((e: Episode) => e.title)).toContain("Second topic");
	});

	test("surprise level maps to correct numeric value", async () => {
		const levels: SurpriseLevel[] = ["low", "high", "extremely_high"];

		for (const level of levels) {
			const localStorage = new InMemoryStorageAdapter();
			const segResponse: SegmentationOutput = {
				segments: [
					{
						startIndex: 0,
						endIndex: 5,
						title: `${level} surprise`,
						summary: `Episode with ${level} surprise`,
						surprise: level,
					},
				],
			};

			const segmenter = new Segmenter(createMockLLM(segResponse), localStorage, {
				minMessages: 3,
				softTrigger: 5,
				hardTrigger: 20,
			});

			for (const msg of makeMessages(5)) {
				await segmenter.addMessage(userId, msg);
			}

			const episodes = await localStorage.getEpisodes(userId);
			expect(episodes[0]!.surprise).toBe(SURPRISE_VALUES[level]);
		}
	});
});

describe("Segmenter — queue management", () => {
	let storage: InMemoryStorageAdapter;

	beforeEach(() => {
		storage = new InMemoryStorageAdapter();
	});

	test("queue is cleared after segmentation of all messages", async () => {
		const segResponse: SegmentationOutput = {
			segments: [
				{
					startIndex: 0,
					endIndex: 5,
					title: "Complete segment",
					summary: "All messages consumed",
					surprise: "low",
				},
			],
		};

		const segmenter = new Segmenter(createMockLLM(segResponse), storage, {
			minMessages: 3,
			softTrigger: 5,
			hardTrigger: 20,
		});

		for (const msg of makeMessages(5)) {
			await segmenter.addMessage(userId, msg);
		}

		const queue = await storage.getMessageQueue(userId);
		expect(queue).toHaveLength(0);
	});

	test("remaining messages are re-queued after partial segmentation", async () => {
		const segResponse: SegmentationOutput = {
			segments: [
				{
					startIndex: 0,
					endIndex: 6,
					title: "Partial segment",
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

		for (const msg of makeMessages(10)) {
			await segmenter.addMessage(userId, msg);
		}

		// 4 remaining messages should be in the queue
		const queue = await storage.getMessageQueue(userId);
		expect(queue).toHaveLength(4);
		expect(queue[0]!.content).toBe("message 6");
	});

	test("messages from different users are isolated", async () => {
		const segResponse: SegmentationOutput = {
			segments: [
				{
					startIndex: 0,
					endIndex: 5,
					title: "User 1 segment",
					summary: "Messages from user 1",
					surprise: "low",
				},
			],
		};

		const segmenter = new Segmenter(createMockLLM(segResponse), storage, {
			minMessages: 3,
			softTrigger: 5,
			hardTrigger: 20,
		});

		// Add messages for user-2 first
		for (const msg of makeMessages(3)) {
			await storage.pushMessage("user-2", msg);
		}

		// Add messages for user-1 triggering segmentation
		for (const msg of makeMessages(5)) {
			await segmenter.addMessage("user-1", msg);
		}

		// user-2 queue should be untouched
		const user2Queue = await storage.getMessageQueue("user-2");
		expect(user2Queue).toHaveLength(3);

		// user-1 episodes created
		const user1Episodes = await storage.getEpisodes("user-1");
		expect(user1Episodes).toHaveLength(1);
	});
});
