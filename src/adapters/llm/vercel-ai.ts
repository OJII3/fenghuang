import type { EmbeddingModel, LanguageModel } from "ai";
import { embed, generateText } from "ai";

import type { ChatMessage } from "../../core/domain/types.ts";
import type { LLMPort, Schema } from "../../ports/llm.ts";

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

		// Append JSON instruction to the last user message
		const augmented = appendJsonInstruction(userMessages);

		const result = await generateText({
			model: this.model,
			system,
			messages: augmented,
			...buildGenerationOptions(this.temperature, this.maxTokens),
		});

		const parsed: unknown = JSON.parse(cleanJsonResponse(result.text));
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
			content: `${lastMsg.content}\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown, no code fences, no explanation.`,
		};
	}
	return augmented;
}

/** Clean LLM response that may contain markdown code fences */
function cleanJsonResponse(text: string): string {
	const trimmed = text.trim();
	const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
	if (fenceMatch?.[1]) {
		return fenceMatch[1].trim();
	}
	return trimmed;
}
