import { ConstraintViolated, NotFound, withTransaction, type Tx } from "@/lib/db";
import { actorRequirement } from "../actor";
import { recordAudit } from "../audit";
import type { PersonRecord } from "../person-record";
import { updateEmergencyContactField, updatePersonField } from "../person-write";
import { checkMergeRefusal, readMergeSide } from "./eligibility";
import {
  CONTACT_KIND_SCOPE,
  consentNeedsChoice,
  currentPreferred,
  fieldValue,
  needsChoiceBetween,
  readConsentCombinations,
  readProspectCombinations,
  readSideLabelIn,
  readWillMove,
  repointAgreements,
  repointConsents,
  repointDisputes,
  type MergeConsentChoices,
  type MergeConsentCombination,
  type MergeProspectCombination,
} from "./preview";
import {
  MERGE_CONTACT_KIND_LABELS,
  MERGE_PERSON_FIELD_LABELS,
  type MergeContactKind,
  type MergeFieldChoices,
  type MergePersonField,
} from "./types";

/**
 * The write — every reference this package knows how to re-point.
 * {@link mergePersons} re-checks eligibility under a real row lock (a
 * preview is never authoritative under a race), then repoints every table
 * in turn and blind-repoints everything in `PERSON_REFERENCE_COLUMNS`.
 * LAN-185. `tests/person-merge-reference-catalogue.test.ts` asks
 * `pg_constraint` for the real set and fails if this has drifted from it.
 * Decision history (the module's full "which references" note): docs/ux/tickets/LAN-185-person-write.md.
 */

/**
 * Every foreign key to `public.people` this module blind-re-points:
 * `UPDATE <table> SET <column> = survivor WHERE <column> = loser`. Safe
 * unconditionally — none of these columns sits in a unique constraint that
 * also names another foreign key `mergePersons()` does not already
 * neutralise first (`recruitment_prospects` and `person_emergency_contacts`
 * are re-pointed separately, above this list, precisely because they are not
 * safe blind; `season_memberships` joins them as of `Q-16` — correction
 * round 2 — because an archived overlap membership must stay on the loser).
 * `tests/person-merge-reference-catalogue.test.ts` proves this against
 * `pg_constraint` directly.
 */
export const PERSON_REFERENCE_COLUMNS: ReadonlyArray<{ table: string; column: string }> = [
  { table: "attendance_records", column: "person_id" },
  { table: "attendance_records", column: "recorded_by_person_id" },
  { table: "audit_events", column: "actor_person_id" },
  { table: "availability_statuses", column: "confirmed_by_person_id" },
  { table: "availability_statuses", column: "reported_by_person_id" },
  { table: "blues_awards", column: "recorded_by_person_id" },
  { table: "club_link_tokens", column: "issued_by_person_id" },
  { table: "coach_group_assignments", column: "recorded_by_person_id" },
  { table: "coach_group_assignments", column: "responsible_coach_person_id" },
  { table: "delivery_results", column: "actor_person_id" },
  { table: "event_audience_members", column: "added_by_person_id" },
  { table: "event_audience_members", column: "person_id" },
  { table: "event_messaging_plans", column: "frozen_by_person_id" },
  { table: "events", column: "approved_by_person_id" },
  { table: "events", column: "audience_confirmed_by_person_id" },
  { table: "events", column: "owner_person_id" },
  { table: "follow_up_actions", column: "owner_person_id" },
  { table: "follow_up_actions", column: "subject_person_id" },
  { table: "formalwear_records", column: "recorded_by_person_id" },
  { table: "invitations", column: "person_id" },
  { table: "nonresponse_flags", column: "resolved_by_person_id" },
  { table: "notification_jobs", column: "held_by_person_id" },
  { table: "notification_jobs", column: "person_id" },
  // LAN-214 (WP-onboarding-substrate). Actor columns with no per-person
  // uniqueness to collide on — the same shape `audit_events.actor_person_id`
  // already re-points blindly.
  { table: "bps_selections", column: "recorded_by_person_id" },
  { table: "onboarding_activity_log", column: "actor_person_id" },
  { table: "onboarding_item_history", column: "actor_person_id" },
  { table: "onboarding_items", column: "waived_by_person_id" },
  { table: "person_access_tokens", column: "issued_by_person_id" },
  { table: "person_access_tokens", column: "person_id" },
  { table: "person_emergency_contacts", column: "recorded_by_person_id" },
  // LAN-214. The four-role operator who raised or resolved a disputed
  // fact — an actor column, not the dispute's subject (`person_id`, excluded
  // below).
  { table: "person_fact_disputes", column: "raised_by_person_id" },
  { table: "person_fact_disputes", column: "resolved_by_person_id" },
  { table: "position_assignments", column: "recorded_by_person_id" },
  // LAN-201 (WP-recruitment-schema). Each is an actor/author column with no
  // per-season uniqueness to collide on — the same shape
  // `season_membership_status_events.actor_person_id` already re-points blindly.
  { table: "recruitment_prospect_notes", column: "author_person_id" },
  { table: "recruitment_prospect_status_events", column: "actor_person_id" },
  { table: "recruitment_signup_codes", column: "deactivated_by_person_id" },
  { table: "recruitment_signup_codes", column: "minted_by_person_id" },
  { table: "role_assignments", column: "appointed_by_person_id" },
  { table: "role_assignments", column: "person_id" },
  { table: "rsvp_access_tokens", column: "issued_by_person_id" },
  { table: "rsvp_responses", column: "recorded_by_person_id" },
  { table: "schedule_changes", column: "approved_by_person_id" },
  { table: "schedule_changes", column: "recorded_by_person_id" },
  { table: "season_membership_status_events", column: "actor_person_id" },
  // The actor, not the subject — `season_messaging_consents.person_id` is
  // excluded below for the same reason `recruitment_prospects.person_id` is.
  { table: "season_messaging_consents", column: "recorded_by_person_id" },
  { table: "seasons", column: "closed_by_person_id" },
  { table: "seasons", column: "opened_by_person_id" },
  { table: "staging.legacy_roster_rows", column: "matched_person_id" },
  { table: "weekly_reports", column: "generated_by_person_id" },
];

/**
 * Every foreign key to `public.people` this module deliberately leaves
 * untouched, and why — read by the catalogue test alongside
 * `PERSON_REFERENCE_COLUMNS` so the two together account for the whole set.
 */
export const PERSON_REFERENCE_COLUMNS_EXCLUDED: ReadonlyArray<{
  table: string;
  column: string;
  reason: string;
}> = [
  { table: "people", column: "merged_by_person_id", reason: "describes the merge event itself" },
  { table: "people", column: "merged_into_person_id", reason: "describes the merge event itself" },
  {
    table: "operator_accounts",
    column: "person_id",
    reason:
      "a login/seat — Mission 1's boundary; the active-seat refusal exists so this never needs re-pointing",
  },
  {
    table: "contact_points",
    column: "person_id",
    reason: "re-pointed with preference reconciliation",
  },
  {
    table: "person_aliases",
    column: "person_id",
    reason: "re-pointed with display-name reconciliation",
  },
  {
    table: "person_emergency_contacts",
    column: "person_id",
    reason: "one per person; the chosen side is written onto the survivor's own row instead",
  },
  {
    table: "recruitment_prospects",
    column: "person_id",
    reason: "combined per season before re-pointing",
  },
  {
    table: "season_messaging_consents",
    column: "person_id",
    reason:
      "keyed (person_id, season_id) like recruitment_prospects — B-003 (correction round 2, " +
      "Q-10, WP-operator-record, LAN-217): combined per season before re-pointing, the " +
      "operator's own explicit choice governing (defaulting to the survivor's own value), " +
      "the same as any other field or contact row on this same screen",
  },
  {
    table: "onboarding_agreements",
    column: "person_id",
    reason:
      "keyed (person_id, season_id, agreement_type) — combined per season and type before " +
      "re-pointing (WP-operator-record, LAN-217): the earlier `agreed_at` of the two survives, " +
      "the true historical fact of when this person first agreed",
  },
  {
    table: "person_fact_disputes",
    column: "person_id",
    reason:
      "the dispute's subject, with at most one OPEN row per (person_id, field) — combined " +
      "before re-pointing (WP-operator-record, LAN-217): where both sides hold an open dispute " +
      "on the same field, the more recently raised one survives in place, the same " +
      "'the newer answer supersedes the waiting one' rule a single person's own repeated " +
      "answer already follows (raisePersonFactDisputeIn's own upsert); never auto-resolved, " +
      "since resolving is a four-role decision this merge does not make on anybody's behalf",
  },
  {
    table: "season_memberships",
    column: "person_id",
    reason:
      "re-pointed with one exclusion — Q-16: an overlap season the operator archived to clear " +
      "the refusal stays on the merged-away record, never re-pointed onto the survivor",
  },
];

async function repointAliases(tx: Tx, survivorId: string, loserId: string): Promise<void> {
  // A loser alias whose text the survivor already carries would collide with
  // `person_aliases_unique_per_person` — dropped rather than duplicated; the
  // survivor already has that name form.
  await tx.query(
    `delete from public.person_aliases
      where person_id = $1::uuid
        and alias in (select alias from public.person_aliases where person_id = $2::uuid)`,
    [loserId, survivorId],
  );
  // Re-pointed aliases are never the display name on the survivor —
  // "dedupe evidence, never as roster display."
  await tx.query(
    `update public.person_aliases set person_id = $2::uuid, is_display_name = false
      where person_id = $1::uuid`,
    [loserId, survivorId],
  );
}

/**
 * Every current, preferred contact point of one kind and scope, for either
 * person — the two candidates a "differs" comparison row ever offers a
 * choice between.
 */
async function currentPreferredIdIn(
  tx: Tx,
  personId: string,
  kind: "email" | "phone",
  scope: "personal" | "college" | null,
): Promise<string | null> {
  const result = await tx.query<{ id: string }>(
    `select id from public.contact_points
      where person_id = $1::uuid and kind = $2::public.contact_point_kind
        and scope is not distinct from $3::public.contact_point_scope
        and is_preferred and valid_until is null`,
    [personId, kind, scope],
  );
  return result.rows[0]?.id ?? null;
}

async function demoteContactIn(tx: Tx, contactId: string): Promise<void> {
  await tx.query(
    `update public.contact_points set is_preferred = false, valid_until = now()
      where id = $1::uuid and valid_until is null`,
    [contactId],
  );
}

/**
 * Re-points every current and historical contact point of both people onto
 * the survivor, resolving which one stays preferred per kind and scope —
 * REQ-merge: "contact points from both are kept; one per kind stays
 * preferred."
 *
 * The demotion happens *before* either row is re-pointed, while the two
 * candidates still carry their own distinct `person_id` — demoting a row in
 * place never collides with anything, because `contact_points_one_preferred_
 * per_kind` is scoped per person. Only once at most one candidate is left
 * `is_preferred` does the blind move of every remaining row follow; doing it
 * in the other order asks the unique index to hold two preferred rows for
 * the survivor at once, even for an instant inside one statement.
 */
async function repointContacts(
  tx: Tx,
  survivorId: string,
  loserId: string,
  choices: MergeFieldChoices,
): Promise<void> {
  for (const kind of Object.keys(MERGE_CONTACT_KIND_LABELS) as MergeContactKind[]) {
    const { kind: k, scope } = CONTACT_KIND_SCOPE[kind];

    const survivorPreferredId = await currentPreferredIdIn(tx, survivorId, k, scope);
    const loserPreferredId = await currentPreferredIdIn(tx, loserId, k, scope);

    const wantsLoser = choices[kind] === "loser" && loserPreferredId !== null;
    const desiredId = wantsLoser ? loserPreferredId : survivorPreferredId;

    if (survivorPreferredId && survivorPreferredId !== desiredId) {
      await demoteContactIn(tx, survivorPreferredId);
    }
    if (loserPreferredId && loserPreferredId !== desiredId) {
      await demoteContactIn(tx, loserPreferredId);
    }

    // Every one of the loser's contact points of this kind moves to the
    // survivor, retained. At most one row across both sides is still
    // `is_preferred` for this (kind, scope) at this point, so this can never
    // collide with the survivor's own remaining row.
    await tx.query(
      `update public.contact_points set person_id = $2::uuid
        where person_id = $1::uuid and kind = $3::public.contact_point_kind
          and scope is not distinct from $4::public.contact_point_scope`,
      [loserId, survivorId, k, scope],
    );
  }
}

async function repointProspects(
  tx: Tx,
  survivorId: string,
  loserId: string,
  combinations: readonly MergeProspectCombination[],
): Promise<void> {
  for (const combo of combinations) {
    // A joined prospect carries `converted_membership_id`, tied to a real
    // season membership — combining it here would either drop that link or
    // claim a membership the survivor's own row never had. Left alone: the
    // blind re-point below then meets
    // `recruitment_prospects_one_per_person_per_season` for this one season
    // and refuses the whole merge cleanly, rather than this module silently
    // deciding what a joined record should say.
    if (combo.combinedStatus === "joined") continue;
    await tx.query(
      `update public.recruitment_prospects
          set status = $3::public.prospect_status,
              first_contact_on = coalesce($4::date, first_contact_on),
              committed_on = $5::date
        where person_id = $1::uuid and season_id = $2::uuid`,
      [
        survivorId,
        combo.seasonId,
        combo.combinedStatus,
        combo.combinedFirstContact,
        combo.combinedCommittedOn,
      ],
    );
    await tx.query(
      `delete from public.recruitment_prospects where person_id = $1::uuid and season_id = $2::uuid`,
      [loserId, combo.seasonId],
    );
  }
  // Everything left on the loser has no counterpart on the survivor — a plain
  // re-point, safe because `recruitment_prospects_one_per_person_per_season`
  // cannot collide with a season already handled above.
  await tx.query(
    `update public.recruitment_prospects set person_id = $2::uuid where person_id = $1::uuid`,
    [loserId, survivorId],
  );
}

/**
 * `Q-16` (Brian, correction round 2): a season membership the operator
 * archived to clear the overlap refusal stays on the merged-away record —
 * re-pointing it here would violate `season_memberships_one_per_person_per_
 * season` and re-break the very thing archiving cleared. Excluded
 * deliberately, the same shape `repointProspects()` already uses for a
 * joined prospect it also declines to re-point. Everything else the loser
 * holds — a season with no survivor counterpart — is a plain re-point, safe
 * because the excluded row is the only one that could collide.
 */
async function repointSeasonMemberships(
  tx: Tx,
  survivorId: string,
  loserId: string,
  retainedMembershipIds: readonly string[],
): Promise<void> {
  await tx.query(
    `update public.season_memberships set person_id = $2::uuid
      where person_id = $1::uuid and not (id = any($3::uuid[]))`,
    [loserId, survivorId, retainedMembershipIds],
  );
}

async function applyFieldChoices(
  tx: Tx,
  actorPersonId: string,
  survivorId: string,
  loserId: string,
  reasonNote: string,
  choices: MergeFieldChoices,
  survivorRecord: PersonRecord,
  loserRecord: PersonRecord,
): Promise<void> {
  for (const field of Object.keys(MERGE_PERSON_FIELD_LABELS) as MergePersonField[]) {
    if (choices[field] !== "loser") continue;
    const incoming = fieldValue(loserRecord, field);
    const current = fieldValue(survivorRecord, field);
    if (incoming === null || incoming === current) continue;

    if (field === "emergency_contact") {
      const ec = loserRecord.emergencyContact;
      if (!ec) continue;
      if (ec.givenName) {
        await updateEmergencyContactField({
          actorPersonId,
          personId: survivorId,
          field: "given_name",
          value: ec.givenName,
          reason: reasonNote,
        });
      }
      if (ec.familyName) {
        await updateEmergencyContactField({
          actorPersonId,
          personId: survivorId,
          field: "family_name",
          value: ec.familyName,
          reason: reasonNote,
        });
      }
      if (ec.relationship) {
        await updateEmergencyContactField({
          actorPersonId,
          personId: survivorId,
          field: "relationship",
          value: ec.relationship,
          reason: reasonNote,
        });
      }
      if (ec.phone) {
        await updateEmergencyContactField({
          actorPersonId,
          personId: survivorId,
          field: "phone",
          value: ec.phone,
          reason: reasonNote,
        });
      }
      if (ec.email) {
        await updateEmergencyContactField({
          actorPersonId,
          personId: survivorId,
          field: "email",
          value: ec.email,
          reason: reasonNote,
        });
      }
      continue;
    }

    if (field === "given_name") {
      await updatePersonField({
        actorPersonId,
        personId: survivorId,
        field: "given_name",
        value: incoming,
        reason: reasonNote,
      });
    } else if (field === "family_name") {
      await updatePersonField({
        actorPersonId,
        personId: survivorId,
        field: "family_name",
        value: incoming,
        reason: reasonNote,
      });
    } else if (field === "college") {
      await updatePersonField({
        actorPersonId,
        personId: survivorId,
        field: "college",
        value: incoming,
        reason: reasonNote,
      });
    } else if (field === "degree_field") {
      await updatePersonField({
        actorPersonId,
        personId: survivorId,
        field: "degree_field",
        value: incoming,
        reason: reasonNote,
      });
    } else if (field === "date_of_birth") {
      await updatePersonField({
        actorPersonId,
        personId: survivorId,
        field: "date_of_birth",
        value: incoming,
        reason: reasonNote,
      });
    } else if (field === "matriculation_year") {
      await updatePersonField({
        actorPersonId,
        personId: survivorId,
        field: "matriculation_year",
        value: Number(incoming),
        reason: reasonNote,
      });
    } else if (field === "expected_graduation_year") {
      await updatePersonField({
        actorPersonId,
        personId: survivorId,
        field: "expected_graduation_year",
        value: Number(incoming),
        reason: reasonNote,
      });
    }
  }
  void loserId;
}

const requireActor = actorRequirement("A merge has to name the operator who performed it.");

export interface MergePersonsResult {
  survivorPersonId: string;
  loserPersonId: string;
}

/**
 * LAN-256's backstop, inside the merge's own transaction and under its own row
 * locks.
 *
 * The comparison screen disables Merge until every disagreeing row has an
 * answer, but a server action is a POST endpoint the browser can call
 * directly, and the whole defect was that an unanswered row quietly resolved
 * to the survivor. So the rule lives here, where the records are already read
 * and locked, rather than only in the component that draws the radios. It
 * names the fields it is missing, because "answer everything" is not something
 * an operator can act on.
 */
function assertEveryDifferenceAnswered(
  survivorRecord: PersonRecord,
  loserRecord: PersonRecord,
  choices: MergeFieldChoices,
  consentCombinations: readonly MergeConsentCombination[],
  consentChoices: MergeConsentChoices,
): void {
  const unanswered: string[] = [];

  for (const field of Object.keys(MERGE_PERSON_FIELD_LABELS) as MergePersonField[]) {
    const survivorValue = fieldValue(survivorRecord, field);
    const loserValue = fieldValue(loserRecord, field);
    if (needsChoiceBetween(survivorValue, loserValue) && choices[field] === undefined) {
      unanswered.push(MERGE_PERSON_FIELD_LABELS[field]);
    }
  }

  for (const kind of Object.keys(MERGE_CONTACT_KIND_LABELS) as MergeContactKind[]) {
    const survivorValue = currentPreferred(survivorRecord, kind)?.rawValue ?? null;
    const loserValue = currentPreferred(loserRecord, kind)?.rawValue ?? null;
    if (needsChoiceBetween(survivorValue, loserValue) && choices[kind] === undefined) {
      unanswered.push(MERGE_CONTACT_KIND_LABELS[kind]);
    }
  }

  for (const combo of consentCombinations) {
    if (consentNeedsChoice(combo) && consentChoices[combo.seasonId] === undefined) {
      unanswered.push(`Messaging consent · ${combo.seasonLabel}`);
    }
  }

  if (unanswered.length > 0) {
    throw new ConstraintViolated(
      `Choose which value the surviving record keeps for: ${unanswered.join(", ")}.`,
      { rule: "person_merge_requires_a_choice_per_difference" },
    );
  }
}

/**
 * The merge. One transaction: every reference re-pointed, every chosen field
 * value written as an ordinary correction, the losing row marked and dated,
 * and one `person_merged` audit event naming what moved — invariant I6, and
 * `Q-5` in full.
 */
export async function mergePersons(params: {
  actorPersonId: string;
  survivorPersonId: string;
  loserPersonId: string;
  reason: string;
  fieldChoices: MergeFieldChoices;
  /** B-003: per-season consent choice, keyed by season id. LAN-256: required wherever the two states disagree; undeclared is legal only where they already agree. */
  consentChoices?: MergeConsentChoices;
}): Promise<MergePersonsResult> {
  const { actorPersonId, survivorPersonId, loserPersonId, fieldChoices } = params;
  const consentChoices = params.consentChoices ?? {};
  requireActor(actorPersonId);
  const reason = params.reason.trim();
  if (reason === "") {
    throw new ConstraintViolated("A reason is required.", {
      rule: "person_merge_requires_a_reason",
    });
  }
  if (survivorPersonId === loserPersonId) {
    throw new ConstraintViolated("A record cannot be merged with itself.", {
      rule: "person_merge_same_record",
    });
  }

  return withTransaction(async (tx) => {
    // Row locks first, in a fixed order (survivor before loser, by id
    // otherwise) so two concurrent merges naming the same pair can never
    // deadlock against each other.
    const [first, second] =
      survivorPersonId < loserPersonId
        ? [survivorPersonId, loserPersonId]
        : [loserPersonId, survivorPersonId];
    await tx.query(`select id from public.people where id = $1::uuid for update`, [first]);
    await tx.query(`select id from public.people where id = $1::uuid for update`, [second]);

    const survivorSide = await readMergeSide(tx, survivorPersonId);
    const loserSide = await readMergeSide(tx, loserPersonId);
    if (!survivorSide)
      throw new NotFound("That person is not on record.", { rule: "people_not_found" });
    if (!loserSide) {
      throw new ConstraintViolated(
        "That record has already been merged away, so it cannot be merged again.",
        { rule: "person_merge_already_away" },
      );
    }

    const { refusal, retainedMemberships } = await checkMergeRefusal(
      tx,
      survivorPersonId,
      loserPersonId,
    );
    if (refusal) throw new ConstraintViolated(refusal.message, { rule: refusal.rule });

    const willMove = await readWillMove(
      tx,
      loserPersonId,
      retainedMemberships.map((m) => m.membershipId),
    );
    const combinations = await readProspectCombinations(tx, survivorPersonId, loserPersonId);
    const consentCombinations = await readConsentCombinations(tx, survivorPersonId, loserPersonId);

    // LAN-256, before anything is written: an unanswered disagreement is not
    // an implicit vote for the survivor.
    assertEveryDifferenceAnswered(
      survivorSide.record,
      loserSide.record,
      fieldChoices,
      consentCombinations,
      consentChoices,
    );

    const reasonNote = `From merging "${(await readSideLabelIn(tx, loserPersonId)).displayName}" into this record.`;

    await applyFieldChoices(
      tx,
      actorPersonId,
      survivorPersonId,
      loserPersonId,
      reasonNote,
      fieldChoices,
      survivorSide.record,
      loserSide.record,
    );
    await repointContacts(tx, survivorPersonId, loserPersonId, fieldChoices);
    await repointAliases(tx, survivorPersonId, loserPersonId);
    await repointProspects(tx, survivorPersonId, loserPersonId, combinations);
    // B-003 — `WP-operator-record`, LAN-217. The operator's own choice per
    // season, defaulting to the survivor's own value.
    await repointConsents(tx, survivorPersonId, loserPersonId, consentCombinations, consentChoices);
    // Mission owner-question Q-3/Q-5 — the two other per-tuple-unique tables
    // this package was assigned to close, the same shape as consents above.
    await repointAgreements(tx, survivorPersonId, loserPersonId);
    await repointDisputes(tx, survivorPersonId, loserPersonId);
    await repointSeasonMemberships(
      tx,
      survivorPersonId,
      loserPersonId,
      retainedMemberships.map((m) => m.membershipId),
    );

    for (const { table, column } of PERSON_REFERENCE_COLUMNS) {
      // `staging.legacy_roster_rows` already names its own schema; every
      // other entry here is bare and lives in `public`.
      const qualified = table.includes(".") ? table : `public.${table}`;
      await tx.query(`update ${qualified} set ${column} = $2::uuid where ${column} = $1::uuid`, [
        loserPersonId,
        survivorPersonId,
      ]);
    }

    await tx.query(
      `update public.people
          set merged_into_person_id = $2::uuid, merged_at = now(),
              merged_by_person_id = $3::uuid, merge_reason = $4
        where id = $1::uuid`,
      [loserPersonId, survivorPersonId, actorPersonId, reason],
    );

    await recordAudit(tx, {
      actorPersonId,
      action: "person_merged",
      entityTable: "people",
      entityId: survivorPersonId,
      fromState: loserPersonId,
      toState: survivorPersonId,
      reason,
      context: {
        issue: "LAN-185",
        loser_person_id: loserPersonId,
        moved: willMove,
        prospects_combined: combinations.map((c) => ({
          season_id: c.seasonId,
          season_label: c.seasonLabel,
          status: c.combinedStatus,
        })),
        consents_combined: consentCombinations.map((c) => ({
          season_id: c.seasonId,
          season_label: c.seasonLabel,
          state:
            (consentChoices[c.seasonId] ?? "survivor") === "loser" ? c.loserState : c.survivorState,
        })),
      },
    });

    return { survivorPersonId, loserPersonId };
  });
}
