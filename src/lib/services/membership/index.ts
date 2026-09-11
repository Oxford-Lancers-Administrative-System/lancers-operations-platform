// The season membership aggregate's public surface — LAN-75. See `read.ts`,
// `write-status.ts` and `write-items.ts` for the implementation.

export type { MembershipStatus, OnboardingItemStatus } from "./shared";
export { generateOnboardingItems } from "./shared";
export type { MembershipRecord, MembershipStatusEvent, OnboardingItem } from "./read";
export { RESOLVED_ITEM_STATUSES, listCurrentSeasonRoster, readMembership } from "./read";
export { setMembershipStatus } from "./write-status";
export { claimOnboardingItem, resolveOnboardingItem } from "./write-items";
