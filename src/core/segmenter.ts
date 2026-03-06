import type { LLMPort, Schema } from "../ports/llm.ts";
import type { StoragePort } from "../ports/storage.ts";
import type { Episode } from "./domain/episode.ts";
import { createEpisode } from "./domain/episode.ts";
import type { ChatMessage, SurpriseLevel } from "./domain/types.ts";
import { SURPRISE_VALUES } from "./domain/types.ts";

/** Segmentation configuration */
export interface SegmenterConfig {
	/** Minimum messages before segmentation is considered */
	minMessages: number;
	/** Soft trigger threshold — LLM decides whether to segment */
	softTrigger: number;
	/** Hard trigger threshold — forced segmentation */
	hardTrigger: number;
}

export const DEFAULT_SEGMENTER_CONFIG: SegmenterConfig = {
	minMessages: 5,
	softTrigger: 20,
	hardTrigger: 40,
};

/** A detected segment boundary from LLM analysis */
export interface SegmentResult {
	startIndex: number;
	endIndex: number;
	title: string;
	summary: string;
	surprise: SurpriseLevel;
}

/** Output from segment detection */
export interface SegmentationOutput {
	segments: SegmentResult[];
}

/** Event segmentation service — splits conversations into episodes */
export class Segmenter {
	constructor(
		protected llm: LLMPort,
		protected storage: StoragePort,
		protected config: SegmenterConfig = DEFAULT_SEGMENTER_CONFIG,
	) {}

	/**
	 * Add a message to the queue and trigger segmentation if thresholds are met.
	 * Returns any episodes created during segmentation.
	 */
	async addMessage(userId: string, message: ChatMessage): Promise<Episode[]> {
		await this.storage.pushMessage(userId, message);
		const queue = await this.storage.getMessageQueue(userId);

		if (queue.length >= this.config.hardTrigger) {
			return this.segment(userId, queue, true);
		}

		if (queue.length >= this.config.softTrigger) {
			return this.segment(userId, queue, false);
		}

		return [];
	}

	/**
	 * Run segmentation on the message queue.
	 * Detects segments, creates episodes, clears the queue, and re-queues remaining messages.
	 */
	private async segment(userId: string, messages: ChatMessage[], force: boolean): Promise<Episode[]> {
		const detected = await this.detectSegments(messages, force);

		if (detected.segments.length === 0) {
			return [];
		}

		const episodes: Episode[] = [];
		let lastEndIndex = 0;

		for (const seg of detected.segments) {
			const segMessages = messages.slice(seg.startIndex, seg.endIndex);
			if (segMessages.length === 0) continue;

			const embedding = await this.llm.embed(seg.summary);
			const surprise = SURPRISE_VALUES[seg.surprise];

			const startAt = segMessages[0]!.timestamp ?? new Date();
			const endAt = segMessages[segMessages.length - 1]!.timestamp ?? new Date();

			const episode = createEpisode({
				userId,
				title: seg.title,
				summary: seg.summary,
				messages: segMessages,
				embedding,
				surprise,
				startAt,
				endAt,
			});

			await this.storage.saveEpisode(userId, episode);
			episodes.push(episode);

			if (seg.endIndex > lastEndIndex) {
				lastEndIndex = seg.endIndex;
			}
		}

		// Clear queue and re-push remaining messages
		await this.storage.clearMessageQueue(userId);
		const remaining = messages.slice(lastEndIndex);
		for (const msg of remaining) {
			await this.storage.pushMessage(userId, msg);
		}

		return episodes;
	}

	/**
	 * Use LLM to detect segment boundaries in the message queue.
	 */
	private async detectSegments(messages: ChatMessage[], force: boolean): Promise<SegmentationOutput> {
		const formatted = messages.map((m, i) => `[${i}] ${m.role}: ${m.content}`).join("\n");

		const systemPrompt = `You are a conversation analyst. Analyze the following conversation and detect natural topic boundaries to split it into segments.

For each segment, provide:
- startIndex: 0-based index of the first message
- endIndex: 0-based index PAST the last message (exclusive)
- title: A concise title for the segment (max 60 chars)
- summary: A 1-2 sentence summary of the segment
- surprise: How surprising or novel the content is ("low", "high", or "extremely_high")

Rules:
- Each segment must contain at least ${this.config.minMessages} messages
- Segments must not overlap and must be contiguous from the start
- Not all messages need to belong to a segment — trailing messages with no clear boundary can be omitted
- ${force ? "You MUST produce at least one segment covering the conversation." : "Only produce segments where you detect a clear topic boundary or completion. If no boundary is detected, return an empty segments array."}

Respond with JSON only: {"segments": [...]}`;

		return this.llm.chatStructured<SegmentationOutput>(
			[
				{ role: "system", content: systemPrompt },
				{ role: "user", content: formatted },
			],
			segmentationSchema,
		);
	}
}

/** Schema validator for SegmentationOutput */
const segmentationSchema: Schema<SegmentationOutput> = {
	parse(data: unknown): SegmentationOutput {
		if (typeof data !== "object" || data === null) {
			throw new Error("Expected object");
		}
		const obj = data as Record<string, unknown>;
		if (!Array.isArray(obj["segments"])) {
			throw new Error("Expected segments array");
		}

		const validSurprise = new Set<string>(["low", "high", "extremely_high"]);

		const segments = (obj["segments"] as unknown[]).map((s: unknown, i: number) => {
			if (typeof s !== "object" || s === null) {
				throw new Error(`segments[${i}]: expected object`);
			}
			const seg = s as Record<string, unknown>;

			if (typeof seg["startIndex"] !== "number") throw new Error(`segments[${i}].startIndex: expected number`);
			if (typeof seg["endIndex"] !== "number") throw new Error(`segments[${i}].endIndex: expected number`);
			if (typeof seg["title"] !== "string") throw new Error(`segments[${i}].title: expected string`);
			if (typeof seg["summary"] !== "string") throw new Error(`segments[${i}].summary: expected string`);
			if (!validSurprise.has(seg["surprise"] as string)) {
				throw new Error(`segments[${i}].surprise: expected low, high, or extremely_high`);
			}

			return {
				startIndex: seg["startIndex"] as number,
				endIndex: seg["endIndex"] as number,
				title: seg["title"] as string,
				summary: seg["summary"] as string,
				surprise: seg["surprise"] as SurpriseLevel,
			};
		});

		return { segments };
	},
};
