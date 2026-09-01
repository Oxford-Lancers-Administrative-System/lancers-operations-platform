import "server-only";

import { ConstraintViolated, type Tx } from "@/lib/db";
import { recordAudit } from "./audit";
import { grantSeasonMessagingConsentIn } from "./messaging-consent";
import { findPersonDuplicates } from "./person-duplicate";
import { recordRecruitmentSignupCodeUseIn } from "./recruitment-signup-codes";

/**
 * The sign-up gate's one write — LAN-202. **The single consent gate**, and the
 * same surface as Questionnaire A, reached through two doors:
 *
 *   - {@link signUpAnonymouslyIn} — the QR door (`W7`). Nothing is known in
 *     advance; a person is minted unless the recruit confirms an existing one.
 *   - {@link signUpWithTokenIn} — the tokenised, prefilled door, for somebody
 *     the club already has. Never creates a second person or a second
 *     `recruitment_prospects` row for the same (person, season).
 *
 * ## No operator, on purpose
 *
 * Every write in this module runs unauthenticated. There is no
 * `actorPersonId` parameter anywhere here, unlike the rest of the service
 * layer's own README rule — the same departure `player-answer-tokens.ts`'s
 * `consumeAnswerTokenIn` already takes, and for the same reason: the credential
 * (a code that is not a secret, or a person token that is) is the whole of the
 * authorization, and `recordAudit`'s `actorLabel` names the mechanism honestly
 * instead of a person who was never there.
 *
 * ## First name, last name, the tick — nothing else blocks
 *
 * Brian, 2026-09-01: "First name, last name and the consent tick are the
 * required set." {@link validateSignupSubmission} is the one place that is
 * enforced, for both doors, before anything is written. Every other field
 * below is filled only when the recruit actually supplied it, and a blank
 * optional field never blocks the save (`REQ-missing-never-blocks`).
 *
 * ## Questionnaire A lands on the person record, not a response table
 *
 * `W4`'s own core-decisions table: "The page also asks Questionnaire A, on the
 * same surface as the consent gate" is `locked`, and Questionnaire A's fields
 * (Known as, mobile, email, college, matriculation year, expected graduation,
 * degree) are Mission 5's own person-record columns — never
 * `recruitment_questionnaire_responses`, which this package leaves alone.
 * That table's generic `question_code` shape exists for Questionnaire B
 * (football background), whose own six-field set is still "proposed for owner
 * approval" and which this sign-up form does not ask.
 *
 * ## Filling, never silently overwriting
 *
 * A field already carrying a value is left alone here — an unauthenticated
 * public form has no actor and no reason to attach to a correction, which is
 * exactly what `person-write.ts`'s `updatePersonField`/`supersedeContactPoint`
 * require for every value that is not empty. A blank field is filled outright,
 * matching that same module's own rule that filling an empty value needs no
 * reason. The one exception is `given_name`/`family_name` on the **tokenised**
 * door: the credential already acts as this exact person (Task 08 §3), so
 * "check it, change anything that is wrong" (`W4`) is taken at face value
 * there, and only there.
 */

export interface SignupSubmission {
  readonly givenName: string;
  readonly familyName: string;
  readonly mobile?: string | null;
  readonly email?: string | null;
  readonly knownAs?: string | null;
  readonly college?: string | null;
  /** Raw text, as typed — parsed leniently; unparsable input is simply not recorded. */
  readonly matriculationYear?: string | null;
  readonly expectedGraduationYear?: string | null;
  readonly degreeField?: string | null;
  readonly consent: boolean;
}

export interface SignupResult {
  readonly personId: string;
  readonly personCreated: boolean;
  readonly prospectId: string;
  readonly prospectCreated: boolean;
}

export const SIGNUP_REQUIRES_FIRST_NAME_RULE = "recruitment_signup_requires_a_first_name";
export const SIGNUP_REQUIRES_LAST_NAME_RULE = "recruitment_signup_requires_a_last_name";
export const SIGNUP_REQUIRES_CONSENT_RULE = "recruitment_signup_requires_consent";

function trimmedOrNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * `W7`/`W4`, Brian 2026-09-01. Throws before anything is written — never a
 * raw database constraint — naming exactly which of the three required
 * things is missing.
 */
function validateSignupSubmission(submission: SignupSubmission): {
  givenName: string;
  familyName: string;
} {
  const givenName = trimmedOrNull(submission.givenName);
  if (!givenName) {
    throw new ConstraintViolated("A first name is required.", {
      rule: SIGNUP_REQUIRES_FIRST_NAME_RULE,
    });
  }
  const familyName = trimmedOrNull(submission.familyName);
  if (!familyName) {
    throw new ConstraintViolated("A last name is required.", {
      rule: SIGNUP_REQUIRES_LAST_NAME_RULE,
    });
  }
  if (submission.consent !== true) {
    throw new ConstraintViolated(
      "Tick the consent box to save this form — it cannot be saved without it.",
      { rule: SIGNUP_REQUIRES_CONSENT_RULE },
    );
  }
  return { givenName, familyName };
}

// ---------------------------------------------------------------------------
// The privacy-safe duplicate probe — W7's "have you signed up with us before?"
// ---------------------------------------------------------------------------

export interface SignupDuplicateProbe {
  /** Never a name, an email or a phone number — only whether one matched. */
  readonly found: boolean;
  /** Opaque; carried back only as a hidden field between the two steps of the QR door's own form. */
  readonly matchedPersonId: string | null;
}

const NO_MATCH: SignupDuplicateProbe = { found: false, matchedPersonId: null };

/** A phone number too short to mean anything is not run through the check at all. */
const PLAUSIBLE_MOBILE_MIN_DIGITS = 7;

/**
 * "The match is confirmed only in terms the visitor already supplied — a
 * first name they typed and the last three digits of the number they typed.
 * Nothing is revealed that they did not already know" (`W7`, "The one thing
 * this screen must not become"). This function is the mechanism that makes
 * that true: it returns a bare boolean and an opaque id, never a name, a
 * masked contact value, or anything else `findPersonDuplicates` knows about
 * the candidate. The caller echoes the visitor's *own* typed input back to
 * them; it never reads anything from this result to render.
 *
 * Runs only when a mobile number was actually supplied — `W7`'s privacy
 * reasoning is stated in terms of *a name and a phone number together*, and a
 * name-only match would surface a false positive for every other Alex on the
 * mailing list. No mobile, no probe: the QR door goes straight to creation.
 */
export async function probeExistingRecruitForQrSignup(
  givenName: string,
  mobile: string | null | undefined,
): Promise<SignupDuplicateProbe> {
  const trimmedGiven = trimmedOrNull(givenName);
  const trimmedMobile = trimmedOrNull(mobile);
  if (!trimmedGiven || !trimmedMobile) return NO_MATCH;
  if (trimmedMobile.replace(/\D/g, "").length < PLAUSIBLE_MOBILE_MIN_DIGITS) return NO_MATCH;

  const candidates = await findPersonDuplicates({
    givenName: trimmedGiven,
    phones: [trimmedMobile],
  });
  const phoneMatch = candidates.find((candidate) => candidate.matchedOn.includes("phone")) ?? null;
  return phoneMatch ? { found: true, matchedPersonId: phoneMatch.personId } : NO_MATCH;
}

// ---------------------------------------------------------------------------
// Questionnaire A — filled onto the person record, never overwritten
// ---------------------------------------------------------------------------

const TEXT_FIELD_COLUMNS = {
  college: "college",
  degreeField: "degree_field",
} as const;

async function fillPersonTextFieldIfBlankIn(
  tx: Tx,
  personId: string,
  column: (typeof TEXT_FIELD_COLUMNS)[keyof typeof TEXT_FIELD_COLUMNS],
  value: string | null | undefined,
): Promise<void> {
  const trimmed = trimmedOrNull(value);
  if (!trimmed) return;
  await tx.query(
    `update public.people set ${column} = $2, updated_at = now() where id = $1::uuid and ${column} is null`,
    [personId, trimmed],
  );
}

const YEAR_FIELD_COLUMNS = {
  matriculationYear: "matriculation_year",
  expectedGraduationYear: "expected_graduation_year",
} as const;

/** Parsed leniently — `W7`: "recruitment is not a validation exercise." Unparsable input is simply skipped. */
async function fillPersonYearFieldIfBlankIn(
  tx: Tx,
  personId: string,
  column: (typeof YEAR_FIELD_COLUMNS)[keyof typeof YEAR_FIELD_COLUMNS],
  value: string | null | undefined,
): Promise<void> {
  const trimmed = trimmedOrNull(value);
  if (!trimmed) return;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed) || parsed < 1900 || parsed > 2200) return;
  await tx.query(
    `update public.people set ${column} = $2, updated_at = now() where id = $1::uuid and ${column} is null`,
    [personId, parsed],
  );
}

/**
 * Adds a contact value only when this person currently holds none of that
 * kind and scope — never supersedes an existing one, which
 * `supersedeContactPoint` reserves for an authenticated correction with a
 * reason this public form has neither of.
 */
async function fillContactIfNoneIn(
  tx: Tx,
  personId: string,
  kind: "phone" | "email",
  scope: "personal" | null,
  rawValue: string | null | undefined,
): Promise<void> {
  const trimmed = trimmedOrNull(rawValue);
  if (!trimmed) return;

  const current = await tx.query(
    `select 1 from public.contact_points
      where person_id = $1::uuid and kind = $2::public.contact_point_kind
        and scope is not distinct from $3::public.contact_point_scope
        and valid_until is null and is_preferred`,
    [personId, kind, scope],
  );
  if (current.rows.length > 0) return;

  await tx.query(
    `insert into public.contact_points (person_id, kind, scope, raw_value, is_preferred, source)
     values ($1::uuid, $2::public.contact_point_kind, $3::public.contact_point_scope, $4, true, $5)`,
    [personId, kind, scope, trimmed, "recruitment sign-up (LAN-202)"],
  );
}

/**
 * "Known as" writes a `person_aliases` row and nothing else — there is no
 * preferred-name field (Brian, 2026-09-01). Only when it differs from the
 * given name: a "Known as" that repeats the first name is not a name form,
 * the same guard `person_substrate`'s own `known_as` migration already
 * applies.
 */
async function recordKnownAsIn(
  tx: Tx,
  personId: string,
  givenName: string,
  knownAs: string | null | undefined,
): Promise<void> {
  const trimmed = trimmedOrNull(knownAs);
  if (!trimmed) return;
  if (trimmed.toLowerCase() === givenName.trim().toLowerCase()) return;

  await tx.query(
    `update public.person_aliases set is_display_name = false
      where person_id = $1::uuid and is_display_name and alias <> $2`,
    [personId, trimmed],
  );
  await tx.query(
    `insert into public.person_aliases (person_id, alias, source, is_display_name)
     values ($1::uuid, $2, $3, true)
     on conflict (person_id, alias) do update set is_display_name = true`,
    [personId, trimmed, "recruitment sign-up (LAN-202)"],
  );
}

async function applyQuestionnaireAAnswersIn(
  tx: Tx,
  personId: string,
  givenName: string,
  submission: SignupSubmission,
): Promise<void> {
  await recordKnownAsIn(tx, personId, givenName, submission.knownAs);
  await fillPersonTextFieldIfBlankIn(tx, personId, TEXT_FIELD_COLUMNS.college, submission.college);
  await fillPersonTextFieldIfBlankIn(
    tx,
    personId,
    TEXT_FIELD_COLUMNS.degreeField,
    submission.degreeField,
  );
  await fillPersonYearFieldIfBlankIn(
    tx,
    personId,
    YEAR_FIELD_COLUMNS.matriculationYear,
    submission.matriculationYear,
  );
  await fillPersonYearFieldIfBlankIn(
    tx,
    personId,
    YEAR_FIELD_COLUMNS.expectedGraduationYear,
    submission.expectedGraduationYear,
  );
  await fillContactIfNoneIn(tx, personId, "phone", null, submission.mobile);
  await fillContactIfNoneIn(tx, personId, "email", "personal", submission.email);
}

// ---------------------------------------------------------------------------
// The prospect row — one per (person, season), never a second
// ---------------------------------------------------------------------------

interface EnsuredProspect {
  readonly id: string;
  readonly created: boolean;
}

/**
 * `recruitment_prospects_one_per_person_per_season` is the schema's own
 * guarantee; this is `on conflict … do nothing` plus a read, which is what
 * makes "completing it creates no duplicate person and no second recruit
 * row" (LAN-202 "Done when") true under a retried or double submit, not just
 * under normal use.
 */
async function ensureProspectIn(
  tx: Tx,
  personId: string,
  seasonId: string,
  source: string,
): Promise<EnsuredProspect> {
  const inserted = await tx.query<{ id: string }>(
    `insert into public.recruitment_prospects (person_id, season_id, source)
     values ($1::uuid, $2::uuid, $3)
     on conflict (person_id, season_id) do nothing
     returning id`,
    [personId, seasonId, source],
  );
  if (inserted.rows[0]) return { id: inserted.rows[0].id, created: true };

  const existing = await tx.query<{ id: string }>(
    `select id from public.recruitment_prospects where person_id = $1::uuid and season_id = $2::uuid`,
    [personId, seasonId],
  );
  return { id: existing.rows[0].id, created: false };
}

async function insertPersonIn(tx: Tx, givenName: string, familyName: string): Promise<string> {
  const result = await tx.query<{ id: string }>(
    `insert into public.people (given_name, family_name) values ($1, $2) returning id`,
    [givenName, familyName],
  );
  return result.rows[0].id;
}

// ---------------------------------------------------------------------------
// The two doors
// ---------------------------------------------------------------------------

/** The one `season_messaging_consent_source` this form ever writes — see the module note. */
const SELF_ENTRY_SOURCE = "qr_self_entry";

/**
 * The QR (anonymous) door. `linkExistingPersonId` is set only when the
 * recruit answered "Yes, that's me" to {@link probeExistingRecruitForQrSignup}'s
 * own question — re-checked here, inside the transaction, never trusted from
 * the client (the same posture `createPerson`'s `link_existing` branch
 * already takes): a stale or merged-away id falls back to creating a new
 * person rather than failing the whole submission, matching `W7`'s "refuses
 * nobody and blocks on nothing."
 */
export async function signUpAnonymouslyIn(
  tx: Tx,
  params: {
    seasonId: string;
    code: string;
    submission: SignupSubmission;
    linkExistingPersonId?: string | null;
  },
): Promise<SignupResult> {
  const { givenName, familyName } = validateSignupSubmission(params.submission);

  let personId: string;
  let personCreated: boolean;

  if (params.linkExistingPersonId) {
    const existing = await tx.query<{ id: string; merged_into_person_id: string | null }>(
      `select id, merged_into_person_id from public.people where id = $1::uuid for update`,
      [params.linkExistingPersonId],
    );
    const row = existing.rows[0];
    if (row && !row.merged_into_person_id) {
      personId = row.id;
      personCreated = false;
    } else {
      personId = await insertPersonIn(tx, givenName, familyName);
      personCreated = true;
    }
  } else {
    personId = await insertPersonIn(tx, givenName, familyName);
    personCreated = true;
  }

  await applyQuestionnaireAAnswersIn(tx, personId, givenName, params.submission);
  const prospect = await ensureProspectIn(tx, personId, params.seasonId, SELF_ENTRY_SOURCE);
  await grantSeasonMessagingConsentIn(tx, personId, params.seasonId);
  await recordRecruitmentSignupCodeUseIn(tx, params.code);

  await recordAudit(tx, {
    actorLabel: personCreated
      ? "recruit: QR sign-up form (new person)"
      : "recruit: QR sign-up form (self-identified as an existing record)",
    action: personCreated ? "person_created" : "recruitment_prospect_self_identified",
    entityTable: "people",
    entityId: personId,
    context: { issue: "LAN-202", door: SELF_ENTRY_SOURCE, season_id: params.seasonId },
  });

  return { personId, personCreated, prospectId: prospect.id, prospectCreated: prospect.created };
}

/**
 * The tokenised, prefilled door — for somebody the club already has. The
 * caller resolves the `person_access_tokens` credential (see
 * `player-answer-tokens.ts`'s `resolvePersonTokenIn`) before ever reaching
 * this function; `personId` and `seasonId` are exactly what that credential
 * names. Never creates a second person, and `ensureProspectIn` never creates a
 * second `recruitment_prospects` row for a (person, season) that already has
 * one.
 */
export async function signUpWithTokenIn(
  tx: Tx,
  params: {
    personId: string;
    seasonId: string;
    submission: SignupSubmission;
  },
): Promise<SignupResult> {
  const { givenName, familyName } = validateSignupSubmission(params.submission);

  // The credential already acts as this exact person (Task 08 §3), so their
  // own correction to their own name is taken at face value here — unlike
  // every other field, which is only ever filled when currently blank.
  await tx.query(
    `update public.people set given_name = $2, family_name = $3, updated_at = now() where id = $1::uuid`,
    [params.personId, givenName, familyName],
  );

  await applyQuestionnaireAAnswersIn(tx, params.personId, givenName, params.submission);
  const prospect = await ensureProspectIn(tx, params.personId, params.seasonId, SELF_ENTRY_SOURCE);
  await grantSeasonMessagingConsentIn(tx, params.personId, params.seasonId);

  await recordAudit(tx, {
    actorLabel: "recruit: WhatsApp sign-up link",
    action: "recruitment_prospect_self_completed",
    entityTable: "people",
    entityId: params.personId,
    context: { issue: "LAN-202", door: SELF_ENTRY_SOURCE, season_id: params.seasonId },
  });

  return {
    personId: params.personId,
    personCreated: false,
    prospectId: prospect.id,
    prospectCreated: prospect.created,
  };
}

// ---------------------------------------------------------------------------
// Prefill — the tokenised door's own read, minimal by design
// ---------------------------------------------------------------------------

export interface SignupPrefill {
  readonly givenName: string;
  readonly familyName: string | null;
  readonly mobile: string | null;
  readonly email: string | null;
  readonly college: string | null;
  readonly matriculationYear: number | null;
  readonly expectedGraduationYear: number | null;
  readonly degreeField: string | null;
}

/**
 * Exactly what the tokenised door's form needs to prefill, and nothing this
 * public page does not already show back to its own credential holder. Not
 * `readPersonRecordIn` — that assembles provenance, emergency-contact and
 * blues-count detail no sign-up form has any business reading.
 */
export async function readSignupPrefillIn(tx: Tx, personId: string): Promise<SignupPrefill> {
  const person = await tx.query<{
    given_name: string;
    family_name: string | null;
    college: string | null;
    matriculation_year: number | null;
    expected_graduation_year: number | null;
    degree_field: string | null;
  }>(
    `select given_name, family_name, college, matriculation_year, expected_graduation_year, degree_field
       from public.people where id = $1::uuid`,
    [personId],
  );
  const row = person.rows[0];

  const contacts = await tx.query<{ kind: "phone" | "email"; raw_value: string }>(
    `select kind::text as kind, raw_value from public.contact_points
      where person_id = $1::uuid and valid_until is null and is_preferred`,
    [personId],
  );
  const mobile = contacts.rows.find((c) => c.kind === "phone")?.raw_value ?? null;
  const email = contacts.rows.find((c) => c.kind === "email")?.raw_value ?? null;

  return {
    givenName: row?.given_name ?? "",
    familyName: row?.family_name ?? null,
    mobile,
    email,
    college: row?.college ?? null,
    matriculationYear: row?.matriculation_year ?? null,
    expectedGraduationYear: row?.expected_graduation_year ?? null,
    degreeField: row?.degree_field ?? null,
  };
}
