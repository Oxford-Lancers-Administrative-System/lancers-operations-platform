/**
 * Person merge barrel — W4, LAN-185, `REQ-merge`, invariant I6, `Q-5`. See
 * `write.ts` for the module note on which references are re-pointed.
 */

export * from "./write";
export * from "./types";

export { previewPersonMerge } from "./preview";
export type { MergeConsentChoices, PersonMergePreview } from "./preview";
