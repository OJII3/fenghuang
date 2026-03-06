import type { OpencodeClient } from "@opencode-ai/sdk/client";

import type { ChatMessage } from "../../core/domain/types.ts";
import type { LLMPort, Schema } from "../../ports/llm.ts";
import { JSON_INSTRUCTION, cleanJsonResponse } from "./utils.ts";

/** Embedding function type — injected from outside since opencode has no embedding API */
export type EmbedFn = (text: string) => Promise<number[]>;

/** Options for creating an OpencodeLLMAdapter */
export interface OpencodeLLMAdapterOptions {
	client: OpencodeClient;
	sessionId: string;
	model?: { providerID: string; modelID: string };
	embedFn?: EmbedFn;
}

/** opencode LLM adapter */
export class OpencodeLLMAdapter implements LLMPort {
	private client: OpencodeClient;
	private sessionId: string;
	private model?: { providerID: string; modelID: string };
	private embedFn?: EmbedFn;

	constructor(options: OpencodeLLMAdapterOptions) {
		this.client = options.client;
		this.sessionId = options.sessionId;
		this.model = options.model;
		this.embedFn = options.embedFn;
	}

	async chat(messages: ChatMessage[]): Promise<string> {
		const { system, userText } = formatMessages(messages);

		const response = await this.client.session.prompt({
			path: { id: this.sessionId },
			body: {
				parts: [{ type: "text", text: userText }],
				...(this.model ? { model: this.model } : {}),
				...(system ? { system } : {}),
			},
		});

		if (response.error) {
			throw new Error("LLM chat request failed");
		}

		return extractTextFromParts(response.data?.parts ?? []);
	}

	async chatStructured<T>(messages: ChatMessage[], schema: Schema<T>): Promise<T> {
		const { system, userText } = formatMessages(messages);
		const jsonPrompt = `${userText}\n\n${JSON_INSTRUCTION}`;

		const response = await this.client.session.prompt({
			path: { id: this.sessionId },
			body: {
				parts: [{ type: "text", text: jsonPrompt }],
				...(this.model ? { model: this.model } : {}),
				...(system ? { system } : {}),
			},
		});

		if (response.error) {
			throw new Error("LLM structured chat request failed");
		}

		const text = extractTextFromParts(response.data?.parts ?? []);
		return schema.parse(parseJsonSafe(text));
	}

	async embed(text: string): Promise<number[]> {
		if (!this.embedFn) {
			throw new Error(
				"OpencodeLLMAdapter: no embedFn provided. Inject an embedding function (e.g. local embeddinggemma) via constructor options.",
			);
		}
		return this.embedFn(text);
	}
}

/** Format ChatMessage[] into system prompt + user text for opencode session.prompt */
function formatMessages(messages: ChatMessage[]): { system: string | undefined; userText: string } {
	const systemMessages: string[] = [];
	const conversationParts: string[] = [];

	for (const msg of messages) {
		if (msg.role === "system") {
			systemMessages.push(msg.content);
		} else {
			conversationParts.push(`${msg.role}: ${msg.content}`);
		}
	}

	return {
		system: systemMessages.length > 0 ? systemMessages.join("\n\n") : undefined,
		userText: conversationParts.join("\n"),
	};
}

/** Parse JSON from LLM response text, throwing a sanitized error on failure */
function parseJsonSafe(text: string): unknown {
	try {
		return JSON.parse(cleanJsonResponse(text));
	} catch {
		throw new Error("OpencodeLLMAdapter: LLM response was not valid JSON");
	}
}

/** Extract text content from response parts */
function extractTextFromParts(parts: { type: string; text?: string }[]): string {
	return parts
		.filter((p) => p.type === "text" && p.text)
		.map((p) => p.text ?? "")
		.join("");
}
