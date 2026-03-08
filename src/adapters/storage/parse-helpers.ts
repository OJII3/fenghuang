import type { ChatMessage, FactCategory, MessageRole } from "../../core/domain/types.ts";
import { FACT_CATEGORIES, MESSAGE_ROLES } from "../../core/domain/types.ts";

const VALID_ROLES = new Set<string>(MESSAGE_ROLES);
const VALID_CATEGORIES = new Set<string>(FACT_CATEGORIES);

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

function validateTimestampAsObject(
	value: unknown,
	index: number,
): { timestamp: Date } | Record<string, never> {
	const ts = validateTimestamp(value, index);
	return ts === undefined ? {} : { timestamp: ts };
}

function validateMessage(m: unknown, i: number): ChatMessage {
	if (typeof m !== "object" || m === null) {
		throw new TypeError(`messages[${i}]: expected object`);
	}
	const obj = m as Record<string, unknown>;
	if (typeof obj["content"] !== "string") {
		throw new TypeError(`messages[${i}]: expected content string`);
	}
	return {
		role: validateRole(obj["role"]),
		content: obj["content"] as string,
		...(typeof obj["name"] === "string" ? { name: obj["name"] } : {}),
		...validateTimestampAsObject(obj["timestamp"], i),
	};
}

export function validateMessages(data: unknown, maxLength = 500): ChatMessage[] {
	if (!Array.isArray(data)) {
		throw new TypeError("messages: expected array");
	}
	if (data.length > maxLength) {
		throw new RangeError(`messages: too many elements (${data.length}), maximum ${maxLength}`);
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
