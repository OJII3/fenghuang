import type { EmbeddingModel, LanguageModel } from "ai";
import { embed, generateText } from "ai";

import type { ChatMessage } from "../../core/domain/types.ts";
import type { LLMPort, Schema } from "../../ports/llm.ts";
import { JSON_INSTRUCTION, cleanJsonResponse } from "./utils.ts";

/** Options for creating a VercelAIAdapter */
export interface VercelAIAdapterOptions {
	/** Language model for chat/structured output (e.g. openai("gpt-4o")) */
	model: LanguageModel;
	/** Embedding model (e.g. openai.embedding("text-embedding-3-small")) */
	embeddingModel: EmbeddingModel;
	/** Temperature for generation (default: model default) */
	temperature?: number;
	/** Max tokens for generation (default: model default) */
	maxTokens?: number;
}

/** Vercel AI SDK LLM adapter */
export class VercelAIAdapter implements LLMPort {
	private model: LanguageModel;
	private embeddingModel: EmbeddingModel;
	private temperature?: number;
	private maxTokens?: number;

	constructor(options: VercelAIAdapterOptions) {
		this.model = options.model;
		this.embeddingModel = options.embeddingModel;
		this.temperature = options.temperature;
		this.maxTokens = options.maxTokens;
	}

	async chat(messages: ChatMessage[]): Promise<string> {
		const { system, userMessages } = separateMessages(messages);

		const result = await generateText({
			model: this.model,
			system,
			messages: userMessages,
			...buildGenerationOptions(this.temperature, this.maxTokens),
		});

		return result.text;
	}

	async chatStructured<T>(messages: ChatMessage[], schema: Schema<T>): Promise<T> {
		const { system, userMessages } = separateMessages(messages);

		if (userMessages.length === 0 || userMessages.at(-1)?.role !== "user") {
			throw new Error(
				"VercelAIAdapter: chatStructured requires at least one message and the last message must have role 'user'",
			);
		}

		// Append JSON instruction to the last user message
		const augmented = appendJsonInstruction(userMessages);

		const result = await generateText({
			model: this.model,
			system,
			messages: augmented,
			...buildGenerationOptions(this.temperature, this.maxTokens),
		});

		let parsed: unknown = undefined;
		try {
			parsed = JSON.parse(cleanJsonResponse(result.text));
		} catch {
			throw new Error("VercelAIAdapter: LLM response was not valid JSON");
		}
		return schema.parse(parsed);
	}

	async embed(text: string): Promise<number[]> {
		const result = await embed({
			model: this.embeddingModel,
			value: text,
		});

		return result.embedding;
	}
}

/** Separate ChatMessage[] into system prompt + Vercel AI CoreMessage[] */
function separateMessages(messages: ChatMessage[]): {
	system: string | undefined;
	userMessages: { role: "user" | "assistant"; content: string }[];
} {
	const systemParts: string[] = [];
	const userMessages: { role: "user" | "assistant"; content: string }[] = [];

	for (const msg of messages) {
		if (msg.role === "system") {
			systemParts.push(msg.content);
		} else {
			userMessages.push({ role: msg.role, content: msg.content });
		}
	}

	return {
		system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
		userMessages,
	};
}

/** Build optional generation parameters */
function buildGenerationOptions(
	temperature: number | undefined,
	maxTokens: number | undefined,
): { temperature?: number; maxTokens?: number } {
	const opts: { temperature?: number; maxTokens?: number } = {};
	if (temperature !== undefined) {
		opts.temperature = temperature;
	}
	if (maxTokens !== undefined) {
		opts.maxTokens = maxTokens;
	}
	return opts;
}

/** Append JSON instruction to the last user message */
function appendJsonInstruction(
	messages: { role: "user" | "assistant"; content: string }[],
): { role: "user" | "assistant"; content: string }[] {
	const augmented = [...messages];
	const lastIdx = augmented.length - 1;
	const lastMsg = augmented[lastIdx];
	if (lastIdx >= 0 && lastMsg && lastMsg.role === "user") {
		augmented[lastIdx] = {
			...lastMsg,
			content: `${lastMsg.content}\n\n${JSON_INSTRUCTION}`,
		};
	}
	return augmented;
}
