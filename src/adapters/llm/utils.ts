/** JSON instruction appended to prompts for structured output */
export const JSON_INSTRUCTION =
	"IMPORTANT: Respond ONLY with valid JSON. No markdown, no code fences, no explanation.";

/** Clean LLM response that may contain markdown code fences */
export function cleanJsonResponse(text: string): string {
	const trimmed = text.trim();
	const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
	if (fenceMatch?.[1]) {
		return fenceMatch[1].trim();
	}
	return trimmed;
}
