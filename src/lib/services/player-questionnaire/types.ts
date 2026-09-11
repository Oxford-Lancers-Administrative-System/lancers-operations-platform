export type QuestionnaireStep =
  "details" | "code_of_conduct" | "photo_release" | "bucs_play" | "hudl" | "done";

export const STEP_ORDER: readonly QuestionnaireStep[] = Object.freeze([
  "details",
  "code_of_conduct",
  "photo_release",
  "bucs_play",
  "hudl",
]);

export const TRUST_ITEM_CODES = Object.freeze(["bucs_play", "hudl_access"] as const);
