import type { ChatMessage } from "../../core/domain/types.ts";

export function parseJson<T>(raw: string, field: string): T {
	try {
		return JSON.parse(raw) as T;
	} catch {
		throw new Error(`Failed to parse ${field}`);
	}
}

export function validateMessages(data: unknown): ChatMessage[] {
	if (!Array.isArray(data)) {
		throw new TypeError("messages: expected array");
	}
	return data.map((m, i) => {
		if (typeof m !== "object" || m === null) {
			throw new TypeError(`messages[${i}]: expected object`);
		}
		const obj = m as Record<string, unknown>;
		if (typeof obj["role"] !== "string" || typeof obj["content"] !== "string") {
			throw new TypeError(`messages[${i}]: expected role and content strings`);
		}
		return {
			role: obj["role"] as ChatMessage["role"],
			content: obj["content"] as string,
			...(obj["timestamp"] ? { timestamp: new Date(obj["timestamp"] as string) } : {}),
		};
	});
}

export function validateEmbedding(data: unknown): number[] {
	if (!Array.isArray(data)) {
		throw new TypeError("embedding: expected array");
	}
	for (let i = 0; i < data.length; i++) {
		if (typeof data[i] !== "number") {
			throw new TypeError(`embedding[${i}]: expected number`);
		}
	}
	return data as number[];
}

export function validateStringArray(data: unknown, field: string): string[] {
	if (!Array.isArray(data)) {
		throw new TypeError(`${field}: expected array`);
	}
	for (let i = 0; i < data.length; i++) {
		if (typeof data[i] !== "string") {
			throw new TypeError(`${field}[${i}]: expected string`);
		}
	}
	return data as string[];
}
