import type { AssembledStatus, RequiredField } from "@/lib/services/person-required";
import { REQUIRED_FIELD_LABELS } from "@/lib/services/person-required";

// Words `/operate/people` and `/operate/people/missing` use — LAN-184,
// `REQ-status-naming`. Decision history: docs/ux/tickets/LAN-184-people-and-missing-queue.md · missions/intake/M-PEOPLE-AND-ROSTER/decision-history.md.

export const STATUS_LABELS: Readonly<Record<string, string>> = Object.freeze({
  recruit: "Recruit",
  onboarding: "Onboarding",
  active: "Active",
  inactive: "Inactive",
  departed: "Departed",
  archived: "Archived",
});

/** Every rung the People list and the queue may filter by, in ladder order. */
export const FILTERABLE_STATUSES: readonly AssembledStatus[] = Object.freeze([
  "recruit",
  "onboarding",
  "active",
  "inactive",
  "departed",
  "archived",
]) as readonly AssembledStatus[];

export { labelFor } from "@/lib/services/event-vocabulary";

/** Finding 8, Brian 2026-09-01: a sortable Player/Recruit column. Decision history: docs/ux/tickets/LAN-184-people-and-missing-queue.md · missions/intake/M-PEOPLE-AND-ROSTER/decision-history.md. */
export type PersonType = "player" | "recruit";

export function personType(status: AssembledStatus): PersonType {
  return status === "recruit" ? "recruit" : "player";
}

export const PERSON_TYPE_LABELS: Readonly<Record<PersonType, string>> = Object.freeze({
  player: "Player",
  recruit: "Recruit",
});

export const MISSING_FILTER_FIELDS: readonly RequiredField[] = Object.freeze([
  "given_name",
  "family_name",
  "mobile",
  "personal_email",
  "college",
  "matriculation_year",
  "expected_graduation_year",
  "degree_field",
  "date_of_birth",
  "emergency_contact",
]);

export { REQUIRED_FIELD_LABELS };
