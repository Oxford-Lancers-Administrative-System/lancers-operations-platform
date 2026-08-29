import type { AssembledStatus, RequiredField } from "@/lib/services/person-required";
import { REQUIRED_FIELD_LABELS } from "@/lib/services/person-required";

/**
 * The words `/operate/people` and `/operate/people/missing` use, fixed in one
 * place — LAN-184, `REQ-status-naming`.
 *
 * **The ladder is called Status everywhere.** `Standing` was never an approved
 * term and collided with alumni standing on the same record; renamed
 * 2026-08-27. `AssembledStatus` is `person-required.ts`'s own name for the
 * six-rung ladder `person-record.ts` assembles — this module only supplies the
 * label and the colour, on the same non-decision `roster/presentation.ts`
 * states for `membership_status`: colour never carries the state alone, and a
 * value this map has never heard of renders as itself rather than blank.
 */

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

/**
 * `roster/presentation.ts`'s own mapping, reused rather than re-derived:
 * active success, onboarding info, inactive warning, everything else default.
 * Recruit is not a membership status at all and takes the default, exactly as
 * the approved `W1-01` mockup draws it.
 */
export function statusColour(status: AssembledStatus): "default" | "info" | "success" | "warning" {
  switch (status) {
    case "active":
      return "success";
    case "onboarding":
      return "info";
    case "inactive":
      return "warning";
    default:
      return "default";
  }
}

/** Every fact the missing-data queue may name or filter by, in the field inventory's own order. */
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
