/**
 * Operator administration barrel — LAN-132, mission
 * M-OPERATOR-ADMIN-WITHOUT-SQL. See `shared.ts` for the module note.
 */

export {
  ALREADY_ENDED_RULE,
  ALREADY_HOLDS_ROLE_RULE,
  BACKDATING_REASON_RULE,
  DEACTIVATION_REASON_RULE,
  END_BEFORE_START_RULE,
  END_REASON_RULE,
  MERGED_PERSON_RULE,
  PERSON_NOT_FOUND_RULE,
  REHOME_EMAIL_TAKEN_RULE,
  REHOME_NOT_AVAILABLE_RULE,
  REHOME_REASON_RULE,
  REHOME_SAME_ADDRESS_RULE,
  UNKNOWN_ROLE_RULE,
  earliestEndFor,
} from "./shared";

// Each sibling below exports exactly the barrel's names for it and nothing
// else, so `export *` carries no more than the named form would.
export * from "./assign";
export * from "./end";
export * from "./replace";
export * from "./access";
export * from "./email-rehome";
export * from "./role-detail";
