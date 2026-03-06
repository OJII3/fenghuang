import { describe, expect, mock, test } from "bun:test";

import { VercelAIAdapter } from "../../../src/adapters/llm/vercel-ai.ts";

// Shared state for mock responses
const state = {
	generateText: async (_opts: Record<string, unknown>): Promise<{ text: string }> => ({
		text: "",
	}),
	embed: async (_opts: Record<string, unknown>): Promise<{ embedding: number[] }> => ({
		embedding: [],
	}),
};

// Mock the "ai" module — delegates to state so each test can swap behaviour
mock.module("ai", () => ({
	generateText: (opts: Record<string, unknown>) => state.generateText(opts),
	embed: (opts: Record<string, unknown>) => state.embed(opts),
}));

function createAdapter(opts?: { temperature?: number; maxTokens?: number }) {
	return new VercelAIAdapter({
		// biome-ignore lint: mock model
		model: { modelId: "test-model" } as any,
		// biome-ignore lint: mock model
		embeddingModel: { modelId: "test-embed" } as any,
		...opts,
	});
}

describe("VercelAIAdapter — chat", () => {
	test("chat returns text response", async () => {
		state.generateText = async () => ({ text: "Hello from Vercel AI" });

		const adapter = createAdapter();
		const result = await adapter.chat([{ role: "user", content: "Hi" }]);
		expect(result).toBe("Hello from Vercel AI");
	});

	test("chat separates system and user messages", async () => {
		let capturedOpts: Record<string, unknown> = {};
		state.generateText = async (opts) => {
			capturedOpts = opts;
			return { text: "response" };
		};

		const adapter = createAdapter();
		await adapter.chat([
			{ role: "system", content: "Be helpful" },
			{ role: "user", content: "Hello" },
		]);

		expect(capturedOpts.system).toBe("Be helpful");
		const messages = capturedOpts.messages as { role: string; content: string }[];
		expect(messages).toHaveLength(1);
		expect(messages[0]?.role).toBe("user");
		expect(messages[0]?.content).toBe("Hello");
	});

	test("chat combines multiple system messages", async () => {
		let capturedOpts: Record<string, unknown> = {};
		state.generateText = async (opts) => {
			capturedOpts = opts;
			return { text: "response" };
		};

		const adapter = createAdapter();
		await adapter.chat([
			{ role: "system", content: "Rule 1" },
			{ role: "system", content: "Rule 2" },
			{ role: "user", content: "Hello" },
		]);

		expect(capturedOpts.system).toBe("Rule 1\n\nRule 2");
	});

	test("chat propagates errors", async () => {
		state.generateText = async () => {
			throw new Error("API request failed");
		};

		const adapter = createAdapter();
		await expect(adapter.chat([{ role: "user", content: "Hi" }])).rejects.toThrow(
			"API request failed",
		);
	});

	test("chat with empty messages array", async () => {
		state.generateText = async () => ({ text: "" });

		const adapter = createAdapter();
		const result = await adapter.chat([]);
		expect(result).toBe("");
	});
});

describe("VercelAIAdapter — chatStructured", () => {
	test("chatStructured parses valid JSON response", async () => {
		const jsonResponse = JSON.stringify({ segments: [{ title: "Test" }] });
		state.generateText = async () => ({ text: jsonResponse });

		const adapter = createAdapter();
		const schema = {
			parse: (data: unknown) => data as { segments: { title: string }[] },
		};

		const result = await adapter.chatStructured([{ role: "user", content: "analyze" }], schema);
		expect(result.segments[0]?.title).toBe("Test");
	});

	test("chatStructured strips markdown code fences", async () => {
		state.generateText = async () => ({ text: '```json\n{"value": 42}\n```' });

		const adapter = createAdapter();
		const schema = {
			parse: (data: unknown) => data as { value: number },
		};

		const result = await adapter.chatStructured(
			[{ role: "user", content: "give me json" }],
			schema,
		);
		expect(result.value).toBe(42);
	});

	test("chatStructured appends JSON instruction to last user message", async () => {
		let capturedOpts: Record<string, unknown> = {};
		state.generateText = async (opts) => {
			capturedOpts = opts;
			return { text: '{"ok": true}' };
		};

		const adapter = createAdapter();
		const schema = { parse: (d: unknown) => d };

		await adapter.chatStructured([{ role: "user", content: "test prompt" }], schema);

		const messages = capturedOpts.messages as { role: string; content: string }[];
		expect(messages[0]?.content).toContain("test prompt");
		expect(messages[0]?.content).toContain("IMPORTANT: Respond ONLY with valid JSON");
	});

	test("chatStructured validates with schema.parse", async () => {
		state.generateText = async () => ({
			text: JSON.stringify({ bad: "data" }),
		});

		const adapter = createAdapter();
		const schema = {
			parse: (_data: unknown): never => {
				throw new Error("Schema validation failed");
			},
		};

		await expect(
			adapter.chatStructured([{ role: "user", content: "test" }], schema),
		).rejects.toThrow("Schema validation failed");
	});

	test("chatStructured propagates errors", async () => {
		state.generateText = async () => {
			throw new Error("Structured request failed");
		};

		const adapter = createAdapter();
		const schema = { parse: (d: unknown) => d };

		await expect(
			adapter.chatStructured([{ role: "user", content: "test" }], schema),
		).rejects.toThrow("Structured request failed");
	});

	test("chatStructured throws when last message is assistant", async () => {
		const adapter = createAdapter();
		const schema = { parse: (d: unknown) => d };

		await expect(
			adapter.chatStructured(
				[
					{ role: "user", content: "Hello" },
					{ role: "assistant", content: "Hi there" },
				],
				schema,
			),
		).rejects.toThrow("last message must have role 'user'");
	});

	test("chatStructured throws on invalid JSON response", async () => {
		state.generateText = async () => ({ text: "this is not json at all" });

		const adapter = createAdapter();
		const schema = { parse: (d: unknown) => d };

		await expect(
			adapter.chatStructured([{ role: "user", content: "test" }], schema),
		).rejects.toThrow("VercelAIAdapter: LLM response was not valid JSON");
	});
});

describe("VercelAIAdapter — embed", () => {
	test("embed returns embedding vector", async () => {
		state.embed = async () => ({ embedding: [0.1, 0.2, 0.3] });

		const adapter = createAdapter();
		const result = await adapter.embed("hello world");
		expect(result).toEqual([0.1, 0.2, 0.3]);
	});

	test("embed passes correct arguments", async () => {
		let capturedOpts: Record<string, unknown> = {};
		state.embed = async (opts) => {
			capturedOpts = opts;
			return { embedding: [0.5] };
		};

		const adapter = createAdapter();
		await adapter.embed("test text");

		expect(capturedOpts.value).toBe("test text");
		expect(capturedOpts.model).toEqual({ modelId: "test-embed" });
	});

	test("embed propagates errors", async () => {
		state.embed = async () => {
			throw new Error("Embedding failed");
		};

		const adapter = createAdapter();
		await expect(adapter.embed("hello")).rejects.toThrow("Embedding failed");
	});
});

describe("VercelAIAdapter — options", () => {
	test("temperature and maxTokens are passed to generateText", async () => {
		let capturedOpts: Record<string, unknown> = {};
		state.generateText = async (opts) => {
			capturedOpts = opts;
			return { text: "response" };
		};

		const adapter = createAdapter({ temperature: 0.7, maxTokens: 1024 });
		await adapter.chat([{ role: "user", content: "Hi" }]);

		expect(capturedOpts.temperature).toBe(0.7);
		expect(capturedOpts.maxTokens).toBe(1024);
	});

	test("temperature and maxTokens are passed to chatStructured", async () => {
		let capturedOpts: Record<string, unknown> = {};
		state.generateText = async (opts) => {
			capturedOpts = opts;
			return { text: '{"ok": true}' };
		};

		const adapter = createAdapter({ temperature: 0.5, maxTokens: 512 });
		const schema = { parse: (d: unknown) => d };
		await adapter.chatStructured([{ role: "user", content: "test" }], schema);

		expect(capturedOpts.temperature).toBe(0.5);
		expect(capturedOpts.maxTokens).toBe(512);
	});

	test("options are omitted when not provided", async () => {
		let capturedOpts: Record<string, unknown> = {};
		state.generateText = async (opts) => {
			capturedOpts = opts;
			return { text: "response" };
		};

		const adapter = createAdapter();
		await adapter.chat([{ role: "user", content: "Hi" }]);

		expect(capturedOpts.temperature).toBeUndefined();
		expect(capturedOpts.maxTokens).toBeUndefined();
	});
});
