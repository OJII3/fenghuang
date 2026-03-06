import { describe, expect, test } from "bun:test";

import { cleanJsonResponse } from "../../../src/adapters/llm/utils.ts";

describe("cleanJsonResponse", () => {
	test("returns plain JSON unchanged", () => {
		expect(cleanJsonResponse('{"key": "value"}')).toBe('{"key": "value"}');
	});

	test("strips markdown json code fence", () => {
		const input = '```json\n{"key": "value"}\n```';
		expect(cleanJsonResponse(input)).toBe('{"key": "value"}');
	});

	test("strips markdown code fence without language", () => {
		const input = '```\n{"key": "value"}\n```';
		expect(cleanJsonResponse(input)).toBe('{"key": "value"}');
	});

	test("trims whitespace", () => {
		expect(cleanJsonResponse('  {"key": "value"}  ')).toBe('{"key": "value"}');
	});

	test("handles multi-line JSON in code fence", () => {
		const input = '```json\n{\n  "segments": [\n    {"start": 0}\n  ]\n}\n```';
		expect(cleanJsonResponse(input)).toBe('{\n  "segments": [\n    {"start": 0}\n  ]\n}');
	});

	test("returns empty string for empty input", () => {
		expect(cleanJsonResponse("")).toBe("");
	});

	test("does not strip partial code fences", () => {
		const input = '```json\n{"key": "value"}';
		expect(cleanJsonResponse(input)).toBe(input.trim());
	});
});
