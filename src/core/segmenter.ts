import type { LLMPort } from "../ports/llm.ts";
import type { StoragePort } from "../ports/storage.ts";

/** Segmentation configuration */
export interface SegmenterConfig {
	/** Minimum messages before segmentation is considered */
	minMessages: number;
	/** Soft trigger threshold */
	softTrigger: number;
	/** Hard trigger threshold (forced segmentation) */
	hardTrigger: number;
}

export const DEFAULT_SEGMENTER_CONFIG: SegmenterConfig = {
	minMessages: 5,
	softTrigger: 20,
	hardTrigger: 40,
};

/** Event segmentation service — splits conversations into episodes */
export class Segmenter {
	constructor(
		protected llm: LLMPort,
		protected storage: StoragePort,
		protected config: SegmenterConfig = DEFAULT_SEGMENTER_CONFIG,
	) {}

	// TODO: implement in M2
}
