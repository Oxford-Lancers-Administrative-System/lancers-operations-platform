// Returner intake's public surface — LAN-74. See `duplicate-check.ts` and
// `write.ts` for the implementation.

export type { OpenSeason, PersonCandidate, ReturnerIntakeResult } from "./shared";
export { resolveOpenSeason } from "./shared";
export { findPersonCandidates } from "./duplicate-check";
export { enterReturningPlayer } from "./write";
