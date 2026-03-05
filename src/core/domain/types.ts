/** Message role in a conversation */
export type MessageRole = "system" | "user" | "assistant";

/** A single chat message */
export interface ChatMessage {
	role: MessageRole;
	content: string;
	timestamp?: Date;
}

/** Category for semantic facts */
export type FactCategory =
	| "identity"
	| "preference"
	| "interest"
	| "personality"
	| "relationship"
	| "experience"
	| "goal"
	| "guideline";

/** Surprise level from event segmentation */
export type SurpriseLevel = "low" | "high" | "extremely_high";

/** Surprise level numeric values */
export const SURPRISE_VALUES: Record<SurpriseLevel, number> = {
	low: 0.2,
	high: 0.6,
	extremely_high: 0.9,
};

/** FSRS review rating */
export type ReviewRating = "again" | "hard" | "good" | "easy";

/** Consolidation action for semantic facts */
export type ConsolidationAction = "new" | "reinforce" | "update" | "invalidate";
