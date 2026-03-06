import type { ChatMessage, FactCategory, MessageRole } from "../../core/domain/types.ts";

const VALID_ROLES = new Set<string>(["system", "user", "assistant"]);
const VALID_CATEGORIES = new Set<string>([
	"identity",
	"preference",
	"interest",
	"personality",
	"relationship",
	"experience",
	"goal",
	"guideline",
]);

const MAX_EMBEDDING_DIM = 4096;

export function parseJson(raw: string, field: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		throw new Error(`Failed to parse ${field}`);
	}
}

export function validateRole(value: unknown): MessageRole {
	if (typeof value !== "string" || !VALID_ROLES.has(value)) {
		throw new TypeError(
			`role: expected one of ${[...VALID_ROLES].join(", ")}, got ${String(value)}`,
		);
	}
	return value as MessageRole;
}

export function validateCategory(value: unknown): FactCategory {
	if (typeof value !== "string" || !VALID_CATEGORIES.has(value)) {
		throw new TypeError(
			`category: expected one of ${[...VALID_CATEGORIES].join(", ")}, got ${String(value)}`,
		);
	}
	return value as FactCategory;
}

function validateTimestamp(value: unknown, index: number): Date | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value !== "string" && typeof value !== "number") {
		throw new TypeError(`messages[${index}].timestamp: expected string or number`);
	}
	return new Date(value);
}

function validateMessage(m: unknown, i: number): ChatMessage {
	if (typeof m !== "object" || m === null) {
		throw new TypeError(`messages[${i}]: expected object`);
	}
	const obj = m as Record<string, unknown>;
	if (typeof obj["content"] !== "string") {
		throw new TypeError(`messages[${i}]: expected content string`);
	}
	const role = validateRole(obj["role"]);
	const timestamp = validateTimestamp(obj["timestamp"], i);
	return timestamp
		? { role, content: obj["content"] as string, timestamp }
		: { role, content: obj["content"] as string };
}

export function validateMessages(data: unknown): ChatMessage[] {
	if (!Array.isArray(data)) {
		throw new TypeError("messages: expected array");
	}
	return data.map((m, i) => validateMessage(m, i));
}

export function validateEmbedding(data: unknown): number[] {
	if (!Array.isArray(data)) {
		throw new TypeError("embedding: expected array");
	}
	if (data.length > MAX_EMBEDDING_DIM) {
		throw new RangeError(
			`embedding: too many dimensions (${data.length}), maximum ${MAX_EMBEDDING_DIM}`,
		);
	}
	for (let i = 0; i < data.length; i++) {
		if (typeof data[i] !== "number") {
			throw new TypeError(`embedding[${i}]: expected number`);
		}
	}
	return data as number[];
}

export function validateStringArray(data: unknown, field: string, maxLength?: number): string[] {
	if (!Array.isArray(data)) {
		throw new TypeError(`${field}: expected array`);
	}
	if (maxLength !== undefined && data.length > maxLength) {
		throw new RangeError(`${field}: too many elements (${data.length}), maximum ${maxLength}`);
	}
	for (let i = 0; i < data.length; i++) {
		if (typeof data[i] !== "string") {
			throw new TypeError(`${field}[${i}]: expected string`);
		}
	}
	return data as string[];
}
