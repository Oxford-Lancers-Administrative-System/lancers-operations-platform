import "server-only";

import { ConstraintViolated, NotFound, withTransaction, type Tx } from "@/lib/db";
import { actorRequirement } from "./actor";
import { recordAudit } from "./audit";
import { findPersonDuplicates, type PersonDuplicateCandidate } from "./person-duplicate";
import { readPersonRecordIn, type PersonRecord } from "./person-record";
import {
  validateCollegeEmail,
  validateEmailAddress,
  validatePhoneNumber,
} from "./person-validation";

/**
 * W3 — add or link a person who holds no membership. LAN-185,
 * `REQ-duplicate-check`, `REQ-create-without-roles`. `person-duplicate.ts`
 * answers "who might this already be"; this module is the write that
 * follows. Never assigns a role, opens a login, or creates a membership.
 * Decision history: LAN-185, missions/intake/M-PEOPLE-AND-ROSTER
 */

export interface CreatePersonInput {
  givenName: string;
  familyName: string;
  /** Raw, as typed. Validated here, and again — the same posture `person-write.ts` states. */
  mobile?: string | null;
  personalEmail?: string | null;
  /** LAN-268: optional here — required-ness is each door's own check. This module only owns that a supplied value is real. */
  collegeEmail?: string | null;
}

export type CreatePersonDecision =
  /** "This is them" — link and stop. Nothing is created. */
  | { kind: "link_existing"; personId: string }
  /** "This is somebody new" — mint. `overrideReason` is required only over an exact contact-point match. */
  | { kind: "create_new"; overrideReason?: string | null };

export interface CreatePersonResult {
  personId: string;
  created: boolean;
  record: PersonRecord;
}

const requireActor = actorRequirement("Adding a person has to name the operator who did it.");

function trimmedOrNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** The minimum to mint, checked here rather than trusted from the client. Task 08 §4: last name required at every rung. */
function validateMinimum(input: CreatePersonInput): {
  givenName: string;
  familyName: string;
  mobile: string | null;
  personalEmail: string | null;
  collegeEmail: string | null;
} {
  const givenName = trimmedOrNull(input.givenName);
  if (!givenName) {
    throw new ConstraintViolated("A first name is required.", {
      rule: "people_given_name_not_blank",
    });
  }
  const familyName = trimmedOrNull(input.familyName);
  if (!familyName) {
    throw new ConstraintViolated("A last name is required.", {
      rule: "people_family_name_not_blank",
    });
  }

  const mobile = trimmedOrNull(input.mobile);
  const personalEmail = trimmedOrNull(input.personalEmail);
  if (!mobile && !personalEmail) {
    throw new ConstraintViolated("Enter a mobile number or a personal email.", {
      rule: "person_create_requires_a_contact_point",
    });
  }
  if (mobile) {
    const validation = validatePhoneNumber(mobile);
    if (!validation.valid)
      throw new ConstraintViolated(validation.message, { rule: validation.rule });
  }
  if (personalEmail) {
    const validation = validateEmailAddress(personalEmail);
    if (!validation.valid)
      throw new ConstraintViolated(validation.message, { rule: validation.rule });
  }
  // LAN-268: one validator, shape then domain, so the two refusal sentences stay distinct.
  const collegeEmail = trimmedOrNull(input.collegeEmail);
  if (collegeEmail) {
    const validation = validateCollegeEmail(collegeEmail);
    if (!validation.valid)
      throw new ConstraintViolated(validation.message, { rule: validation.rule });
  }

  return { givenName, familyName, mobile, personalEmail, collegeEmail };
}

/** The same query `findPersonDuplicates` answers, drawn from this input. */
function duplicateQuery(values: {
  givenName: string;
  familyName: string;
  mobile: string | null;
  personalEmail: string | null;
}) {
  return {
    givenName: values.givenName,
    familyName: values.familyName,
    emails: values.personalEmail ? [values.personalEmail] : [],
    phones: values.mobile ? [values.mobile] : [],
  };
}

function exactContactMatch(
  candidates: readonly PersonDuplicateCandidate[],
): PersonDuplicateCandidate | null {
  return (
    candidates.find((c) => c.matchedOn.includes("email") || c.matchedOn.includes("phone")) ?? null
  );
}

async function insertPersonIn(
  tx: Tx,
  values: { givenName: string; familyName: string },
): Promise<string> {
  const result = await tx.query<{ id: string }>(
    `insert into public.people (given_name, family_name) values ($1, $2) returning id`,
    [values.givenName, values.familyName],
  );
  return result.rows[0].id;
}

async function insertContactIn(
  tx: Tx,
  personId: string,
  kind: "email" | "phone",
  scope: "college" | "personal" | null,
  rawValue: string,
): Promise<void> {
  await tx.query(
    `insert into public.contact_points (person_id, kind, scope, raw_value, is_preferred, source)
     values ($1::uuid, $2::public.contact_point_kind, $3::public.contact_point_scope, $4, true, 'operator create')`,
    [personId, kind, scope, rawValue],
  );
}

/** The full W3 flow. Both decisions re-run the duplicate check inside the transaction — never trusting a candidate list the client sent back. */
export async function createPerson(params: {
  actorPersonId: string;
  input: CreatePersonInput;
  decision: CreatePersonDecision;
}): Promise<CreatePersonResult> {
  const { actorPersonId, decision } = params;
  requireActor(actorPersonId);
  const values = validateMinimum(params.input);

  return withTransaction(async (tx) => {
    const candidates = await findPersonDuplicates(duplicateQuery(values));

    if (decision.kind === "link_existing") {
      const target = await tx.query<{ id: string; merged_into_person_id: string | null }>(
        `select id, merged_into_person_id from public.people where id = $1::uuid`,
        [decision.personId],
      );
      const row = target.rows[0];
      if (!row) {
        throw new NotFound("That person is no longer on record. Run the check again.", {
          rule: "people_not_found",
        });
      }
      if (row.merged_into_person_id) {
        throw new ConstraintViolated(
          "That record has been merged into another person. Run the check again and choose the surviving record.",
          { rule: "person_merged_away" },
        );
      }

      await recordAudit(tx, {
        actorPersonId,
        action: "person_duplicate_check_linked",
        entityTable: "people",
        entityId: row.id,
        context: {
          issue: "LAN-185",
          candidates_shown: candidates.map((c) => ({
            personId: c.personId,
            matchedOn: c.matchedOn,
          })),
          answer: "link_existing",
        },
      });

      return { personId: row.id, created: false, record: await readPersonRecordIn(tx, row.id) };
    }

    const exactMatch = exactContactMatch(candidates);
    const overrideReason = trimmedOrNull(decision.overrideReason);
    if (exactMatch && !overrideReason) {
      throw new ConstraintViolated(
        `${exactMatch.displayName} already holds this contact point. Creating anyway needs a reason.`,
        { rule: "person_create_exact_match_requires_reason" },
      );
    }

    const personId = await insertPersonIn(tx, values);
    if (values.mobile) await insertContactIn(tx, personId, "phone", null, values.mobile);
    if (values.personalEmail)
      await insertContactIn(tx, personId, "email", "personal", values.personalEmail);
    if (values.collegeEmail)
      await insertContactIn(tx, personId, "email", "college", values.collegeEmail);

    await recordAudit(tx, {
      actorPersonId,
      action: "person_created",
      entityTable: "people",
      entityId: personId,
      reason: overrideReason,
      context: {
        issue: "LAN-185",
        via: "add_a_person",
        candidates_shown: candidates.map((c) => ({ personId: c.personId, matchedOn: c.matchedOn })),
        answer: "create_new",
        exact_match_person_id: exactMatch?.personId ?? null,
      },
    });

    return { personId, created: true, record: await readPersonRecordIn(tx, personId) };
  });
}
