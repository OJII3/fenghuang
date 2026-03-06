import { describe, expect, test } from "bun:test";

import { OpencodeLLMAdapter } from "../../../src/adapters/llm/opencode.ts";

// biome-ignore lint: mock type doesn't need full interface
function createMockClient(responseText: string) {
	return {
		session: {
			prompt: async (_opts: {
				path: { id: string };
				body: { parts: { type: string; text: string }[]; system?: string };
			}) => ({
				data: {
					parts: [{ type: "text" as const, text: responseText }],
				},
			}),
		},
	};
}

function createErrorClient() {
	return {
		session: {
			prompt: async (_opts: {
				path: { id: string };
				body: { parts: { type: string; text: string }[]; system?: string };
			}) => ({
				error: { message: "request failed" },
				data: undefined,
			}),
		},
	};
}

describe("OpencodeLLMAdapter — chat", () => {
	test("chat returns text response", async () => {
		const client = createMockClient("Hello from LLM");
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock client
		const adapter = new OpencodeLLMAdapter({ client: client as any, sessionId: "sess-1" });

		const result = await adapter.chat([{ role: "user", content: "Hi" }]);
		expect(result).toBe("Hello from LLM");
	});

	test("chat combines system and user messages", async () => {
		let capturedOpts: unknown;
		const client = {
			session: {
				prompt: async (opts: unknown) => {
					capturedOpts = opts;
					return {
						data: { parts: [{ type: "text" as const, text: "response" }] },
					};
				},
			},
		};

		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock client
		const adapter = new OpencodeLLMAdapter({ client: client as any, sessionId: "sess-1" });

		await adapter.chat([
			{ role: "system", content: "Be helpful" },
			{ role: "user", content: "Hello" },
		]);

		const opts = capturedOpts as { body: { parts: { text: string }[]; system?: string } };
		expect(opts.body.system).toBe("Be helpful");
		expect(opts.body.parts[0]!.text).toContain("Hello");
	});

	test("chat throws on error response", async () => {
		const client = createErrorClient();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock client
		const adapter = new OpencodeLLMAdapter({ client: client as any, sessionId: "sess-1" });

		await expect(adapter.chat([{ role: "user", content: "Hi" }])).rejects.toThrow(
			"LLM chat request failed",
		);
	});
});

describe("OpencodeLLMAdapter — chatStructured", () => {
	test("chatStructured parses valid JSON response", async () => {
		const jsonResponse = JSON.stringify({ segments: [{ title: "Test" }] });
		const client = createMockClient(jsonResponse);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock client
		const adapter = new OpencodeLLMAdapter({ client: client as any, sessionId: "sess-1" });

		const schema = {
			parse: (data: unknown) => data as { segments: { title: string }[] },
		};

		const result = await adapter.chatStructured([{ role: "user", content: "analyze" }], schema);
		expect(result.segments[0]!.title).toBe("Test");
	});

	test("chatStructured strips markdown code fences", async () => {
		const jsonResponse = '```json\n{"value": 42}\n```';
		const client = createMockClient(jsonResponse);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock client
		const adapter = new OpencodeLLMAdapter({ client: client as any, sessionId: "sess-1" });

		const schema = {
			parse: (data: unknown) => data as { value: number },
		};

		const result = await adapter.chatStructured(
			[{ role: "user", content: "give me json" }],
			schema,
		);
		expect(result.value).toBe(42);
	});

	test("chatStructured validates with schema.parse", async () => {
		const jsonResponse = JSON.stringify({ bad: "data" });
		const client = createMockClient(jsonResponse);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock client
		const adapter = new OpencodeLLMAdapter({ client: client as any, sessionId: "sess-1" });

		const schema = {
			parse: (_data: unknown): never => {
				throw new Error("Schema validation failed");
			},
		};

		await expect(
			adapter.chatStructured([{ role: "user", content: "test" }], schema),
		).rejects.toThrow("Schema validation failed");
	});

	test("chatStructured throws on error response", async () => {
		const client = createErrorClient();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock client
		const adapter = new OpencodeLLMAdapter({ client: client as any, sessionId: "sess-1" });

		const schema = { parse: (d: unknown) => d };

		await expect(
			adapter.chatStructured([{ role: "user", content: "test" }], schema),
		).rejects.toThrow("LLM structured chat request failed");
	});
});

describe("OpencodeLLMAdapter — embed", () => {
	test("embed delegates to embedFn", async () => {
		const embedFn = async (text: string) => {
			expect(text).toBe("hello world");
			return [0.1, 0.2, 0.3];
		};

		const client = createMockClient("");
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock client
		const adapter = new OpencodeLLMAdapter({
			client: client as any,
			sessionId: "sess-1",
			embedFn,
		});

		const result = await adapter.embed("hello world");
		expect(result).toEqual([0.1, 0.2, 0.3]);
	});

	test("embed throws when no embedFn provided", async () => {
		const client = createMockClient("");
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock client
		const adapter = new OpencodeLLMAdapter({ client: client as any, sessionId: "sess-1" });

		await expect(adapter.embed("hello")).rejects.toThrow("no embedFn provided");
	});
});
