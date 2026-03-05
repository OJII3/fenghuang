import type { ChatMessage } from "../../core/domain/types.ts";
import type { LLMPort, Schema } from "../../ports/llm.ts";

/** opencode LLM adapter */
export class OpencodeLLMAdapter implements LLMPort {
	// TODO: accept opencode client in constructor

	async chat(_messages: ChatMessage[]): Promise<string> {
		throw new Error("Not implemented: OpencodeLLMAdapter.chat");
	}

	async chatStructured<T>(_messages: ChatMessage[], _schema: Schema<T>): Promise<T> {
		throw new Error("Not implemented: OpencodeLLMAdapter.chatStructured");
	}

	async embed(_text: string): Promise<number[]> {
		throw new Error("Not implemented: OpencodeLLMAdapter.embed");
	}
}
