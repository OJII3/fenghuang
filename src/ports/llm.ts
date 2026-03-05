import type { ChatMessage } from "../core/domain/types.ts";

/** Schema definition for structured output */
export interface Schema<T> {
	parse(data: unknown): T;
}

/** LLM Port — Core depends only on this interface */
export interface LLMPort {
	/** Free-form chat response */
	chat(messages: ChatMessage[]): Promise<string>;
	/** Structured output (JSON Schema compliant) */
	chatStructured<T>(messages: ChatMessage[], schema: Schema<T>): Promise<T>;
	/** Generate embedding vector for text */
	embed(text: string): Promise<number[]>;
}
