import { beforeEach, describe, expect, test } from "bun:test";

import { InMemoryStorageAdapter } from "../../src/adapters/storage/in-memory.ts";
import type { Episode } from "../../src/core/domain/episode.ts";
import type { ChatMessage, SurpriseLevel } from "../../src/core/domain/types.ts";
import { SURPRISE_VALUES } from "../../src/core/domain/types.ts";
import type { SegmentationOutput } from "../../src/core/segmenter.ts";
import { Segmenter } from "../../src/core/segmenter.ts";
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

/** Add messages sequentially (order-dependent — each addMessage checks thresholds) */
async function addMessagesSequentially(
	segmenter: Segmenter,
	targetUserId: string,
	messages: ChatMessage[],
): Promise<void> {
	for (const msg of messages) {
		// eslint-disable-next-line no-await-in-loop -- order-dependent: each addMessage checks thresholds
		await segmenter.addMessage(targetUserId, msg);
	}
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
			// eslint-disable-next-line no-await-in-loop -- need to check each return value
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
		await addMessagesSequentially(segmenter, userId, makeMessages(9));

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
		await addMessagesSequentially(segmenter, userId, makeMessages(4));

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
		await addMessagesSequentially(segmenter, userId, makeMessages(5));

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

		await addMessagesSequentially(segmenter, userId, makeMessages(5));

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

		await addMessagesSequentially(segmenter, userId, makeMessages(5));

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

		await addMessagesSequentially(segmenter, userId, makeMessages(10));

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

			// eslint-disable-next-line no-await-in-loop -- each iteration uses separate storage
			await addMessagesSequentially(segmenter, userId, makeMessages(5));

			// eslint-disable-next-line no-await-in-loop -- each iteration uses separate storage
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

		await addMessagesSequentially(segmenter, userId, makeMessages(5));

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

		await addMessagesSequentially(segmenter, userId, makeMessages(10));

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
			// eslint-disable-next-line no-await-in-loop -- sequential push required
			await storage.pushMessage("user-2", msg);
		}

		// Add messages for user-1 triggering segmentation
		await addMessagesSequentially(segmenter, "user-1", makeMessages(5));

		// user-2 queue should be untouched
		const user2Queue = await storage.getMessageQueue("user-2");
		expect(user2Queue).toHaveLength(3);

		// user-1 episodes created
		const user1Episodes = await storage.getEpisodes("user-1");
		expect(user1Episodes).toHaveLength(1);
	});
});

// --- Invalid LLM mock for schema validation tests ---

function createInvalidLLM(invalidResponse: unknown): LLMPort {
	return {
		chat: async () => "",
		chatStructured: async <T>(_msgs: ChatMessage[], schema: Schema<T>) =>
			schema.parse(invalidResponse),
		embed: async () => [0.1, 0.2],
	};
}

describe("Segmenter — schema validation", () => {
	let storage: InMemoryStorageAdapter;

	beforeEach(() => {
		storage = new InMemoryStorageAdapter();
	});

	test("rejects non-object response", async () => {
		const segmenter = new Segmenter(createInvalidLLM("not an object"), storage, {
			minMessages: 1,
			softTrigger: 2,
			hardTrigger: 5,
		});

		await segmenter.addMessage(userId, makeMessage("first"));
		await expect(segmenter.addMessage(userId, makeMessage("trigger"))).rejects.toThrow(
			"Expected object",
		);
	});

	test("rejects response without segments array", async () => {
		const segmenter = new Segmenter(createInvalidLLM({}), storage, {
			minMessages: 1,
			softTrigger: 2,
			hardTrigger: 5,
		});

		await segmenter.addMessage(userId, makeMessage("first"));
		await expect(segmenter.addMessage(userId, makeMessage("trigger"))).rejects.toThrow(
			"Expected segments array",
		);
	});

	test("rejects segment with missing title", async () => {
		const segmenter = new Segmenter(
			createInvalidLLM({
				segments: [{ startIndex: 0, endIndex: 2, summary: "s", surprise: "low" }],
			}),
			storage,
			{ minMessages: 1, softTrigger: 2, hardTrigger: 5 },
		);

		await segmenter.addMessage(userId, makeMessage("first"));
		await expect(segmenter.addMessage(userId, makeMessage("trigger"))).rejects.toThrow("title");
	});

	test("rejects segment with invalid surprise", async () => {
		const segmenter = new Segmenter(
			createInvalidLLM({
				segments: [
					{
						startIndex: 0,
						endIndex: 2,
						title: "t",
						summary: "s",
						surprise: "invalid",
					},
				],
			}),
			storage,
			{ minMessages: 1, softTrigger: 2, hardTrigger: 5 },
		);

		await segmenter.addMessage(userId, makeMessage("first"));
		await expect(segmenter.addMessage(userId, makeMessage("trigger"))).rejects.toThrow("surprise");
	});

	test("rejects segment with non-integer startIndex", async () => {
		const segmenter = new Segmenter(
			createInvalidLLM({
				segments: [
					{
						startIndex: 1.5,
						endIndex: 3,
						title: "t",
						summary: "s",
						surprise: "low",
					},
				],
			}),
			storage,
			{ minMessages: 1, softTrigger: 2, hardTrigger: 5 },
		);

		await segmenter.addMessage(userId, makeMessage("first"));
		await expect(segmenter.addMessage(userId, makeMessage("trigger"))).rejects.toThrow(
			"startIndex",
		);
	});
});

describe("Segmenter — maxQueueSize", () => {
	let storage: InMemoryStorageAdapter;

	beforeEach(() => {
		storage = new InMemoryStorageAdapter();
	});

	test("throws when queue exceeds maxQueueSize", async () => {
		const segmenter = new Segmenter(createMockLLM(), storage, {
			minMessages: 5,
			softTrigger: 100,
			hardTrigger: 200,
			maxQueueSize: 3,
		});

		await segmenter.addMessage(userId, makeMessage("msg 1"));
		await segmenter.addMessage(userId, makeMessage("msg 2"));
		await segmenter.addMessage(userId, makeMessage("msg 3"));

		await expect(segmenter.addMessage(userId, makeMessage("msg 4"))).rejects.toThrow(
			"exceeds maximum size",
		);
	});
});

describe("Segmenter — edge cases", () => {
	let storage: InMemoryStorageAdapter;

	beforeEach(() => {
		storage = new InMemoryStorageAdapter();
	});

	test("segment with startIndex === endIndex creates no episode", async () => {
		// The schema validation rejects endIndex <= startIndex, so a segment
		// with startIndex === endIndex would be rejected at parse time.
		const invalidLLM = createInvalidLLM({
			segments: [
				{
					startIndex: 2,
					endIndex: 2,
					title: "Empty",
					summary: "No messages",
					surprise: "low",
				},
			],
		});

		const segmenter = new Segmenter(invalidLLM, storage, {
			minMessages: 1,
			softTrigger: 2,
			hardTrigger: 5,
		});

		await segmenter.addMessage(userId, makeMessage("first"));
		await expect(segmenter.addMessage(userId, makeMessage("trigger"))).rejects.toThrow("endIndex");
	});
});
