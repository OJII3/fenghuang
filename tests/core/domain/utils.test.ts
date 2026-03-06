import { describe, expect, test } from "bun:test";

import { escapeXmlContent } from "../../../src/core/domain/utils.ts";

describe("escapeXmlContent", () => {
	test("escapes ampersands", () => {
		expect(escapeXmlContent("a & b")).toBe("a &amp; b");
	});

	test("escapes less-than", () => {
		expect(escapeXmlContent("a < b")).toBe("a &lt; b");
	});

	test("escapes greater-than", () => {
		expect(escapeXmlContent("a > b")).toBe("a &gt; b");
	});

	test("escapes all XML-special characters together", () => {
		expect(escapeXmlContent("<script>alert('xss')</script>")).toBe(
			"&lt;script&gt;alert('xss')&lt;/script&gt;",
		);
	});

	test("escapes closing conversation tag (injection vector)", () => {
		expect(escapeXmlContent("</conversation>")).toBe("&lt;/conversation&gt;");
	});

	test("leaves safe content unchanged", () => {
		expect(escapeXmlContent("Hello, world!")).toBe("Hello, world!");
	});

	test("handles empty string", () => {
		expect(escapeXmlContent("")).toBe("");
	});

	test("handles ampersand before angle bracket", () => {
		expect(escapeXmlContent("&<")).toBe("&amp;&lt;");
	});
});
