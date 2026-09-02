import "server-only";

import { ConstraintViolated, InvalidTransition, withTransaction, type Tx } from "@/lib/db";
import { recordAudit } from "./audit";
import { declareRecruitmentCycleJobsIn } from "./recruitment-cycle";
import { RECRUITMENT_ADD_OPT_IN_OPTIONS } from "./recruitment-vocabulary";

/**
 * `W6` — add a recruit by hand. LAN-206.
 *
 * The four shipped fields and the duplicate check are `/operate/people/new`'s
 * own — `findPersonDuplicates` and `createPerson`, called and never
 * duplicated. This module is everything the door adds on top: the Academic
 * section's two person-record fields, the opt-in evidence that makes the
 * welcome lawful to send, refusing a link onto an existing player, and the
 * capture-time cycle declaration the 2026-09-01 amendment requires of this
 * door.
 *
 * `createPerson` opens its own transaction (`person-create.ts`'s own
 * pattern, unchanged here), so this module's own write runs as a second,
 * separate transaction immediately afterwards — the same two-transaction
 * shape `/operate/people/new`'s action already accepts implicitly (its own
 * redirect follows a single `createPerson` call with nothing else to do).
 * Nothing here is undone if the second transaction fails; the person and the
 * shipped audit row it wrote still exist, exactly as a genuine partial
 * failure of two related-but-separate database writes would leave them
 * anywhere else in this codebase that is not already one transaction.
 */

const MOBILE_REQUIRED_RULE = "recruitment_add_mobile_required";
const EXISTING_MEMBER_RULE = "recruitment_add_existing_member_is_not_a_recruit";

const OPT_IN_LABEL: ReadonlyMap<string, string> = new Map(
  RECRUITMENT_ADD_OPT_IN_OPTIONS.map((option) => [option.value, option.label]),
);

/** Task 09 §9.1 / Brian 2026-09-01: mobile joins the required set at this door too. */
export function requireMobileProvided(mobile: string | null | undefined): void {
  if (!mobile || mobile.trim() === "") {
    throw new ConstraintViolated(
      "A mobile number is required at this door — it is how the club reaches a recruit and what the welcome sends to.",
      { rule: MOBILE_REQUIRED_RULE },
    );
  }
}

/**
 * `W6`'s "they already hold a membership" exception: say so and refuse,
 * rather than creating a prospect beside a membership. Checked before
 * `createPerson` is ever called for a `link_existing` decision, so nothing
 * — not even that call's own audit row — is written for a refused link.
 */
export async function refuseIfAlreadyAMemberIn(
  tx: Tx,
  personId: string,
  seasonId: string,
): Promise<void> {
  const membership = await tx.query(
    `select 1 from public.season_memberships where person_id = $1::uuid and season_id = $2::uuid`,
    [personId, seasonId],
  );
  if (membership.rows[0]) {
    throw new InvalidTransition(
      "This person already holds a membership this season — they are a player, not a recruit, so this door will not create a recruit record for them.",
      { rule: EXISTING_MEMBER_RULE },
    );
  }
}

export interface RecruitmentAddAcademic {
  readonly college?: string | null;
  readonly matriculationYear?: string | null;
  /** One of `RECRUITMENT_ADD_OPT_IN_OPTIONS`' own values, or blank for "not recorded". */
  readonly optInEvidence?: string | null;
}

export interface FinishRecruitmentAddResult {
  readonly prospectId: string;
  readonly prospectCreated: boolean;
  readonly cycleDeclared: boolean;
}

/**
 * Everything after `createPerson` resolves a person id: the Academic
 * section's two fields, ensuring the recruit's prospect row (offering the
 * existing one rather than an error when they are already a recruit this
 * season — `recruitment_prospects_one_per_person_per_season`'s own refusal,
 * turned into a redirect target instead of a raw constraint error), the
 * opt-in evidence, and — only once that evidence exists — the season
 * consent grant and the capture-time cycle declaration.
 *
 * `REQ-recruitment-cycle` fires the welcome on capture for this door; the
 * 2026-09-01 amendment is explicit that this calls
 * `declareRecruitmentCycleJobsIn` and never a second declaration. With no
 * opt-in evidence this function still creates the prospect — it simply never
 * grants consent and never calls the declaration at all, so nothing is sent
 * (`mayReceiveWelcomeContactIn` would otherwise read "never asked" as
 * permitted and send anyway, which is exactly the case this door exists to
 * avoid).
 */
export async function finishRecruitmentAddIn(
  tx: Tx,
  params: {
    actorPersonId: string;
    personId: string;
    seasonId: string;
    academic: RecruitmentAddAcademic;
  },
): Promise<FinishRecruitmentAddResult> {
  const { actorPersonId, personId, seasonId, academic } = params;

  const college = academic.college?.trim() || null;
  const matriculationYear = academic.matriculationYear?.trim() || null;
  if (college) {
    await tx.query(
      `update public.people set college = $2, updated_at = now() where id = $1::uuid and college is null`,
      [personId, college],
    );
  }
  if (matriculationYear) {
    const parsed = Number.parseInt(matriculationYear, 10);
    if (Number.isInteger(parsed)) {
      await tx.query(
        `update public.people set matriculation_year = $2, updated_at = now()
          where id = $1::uuid and matriculation_year is null`,
        [personId, parsed],
      );
    }
  }

  const evidenceValue = academic.optInEvidence?.trim() || null;
  const evidenceLabel = evidenceValue ? (OPT_IN_LABEL.get(evidenceValue) ?? null) : null;

  const inserted = await tx.query<{ id: string }>(
    `insert into public.recruitment_prospects (person_id, season_id, source)
     values ($1::uuid, $2::uuid, $3)
     on conflict (person_id, season_id) do nothing
     returning id`,
    [personId, seasonId, evidenceLabel ? `Operator add · ${evidenceLabel}` : "Operator add"],
  );
  let prospectId: string;
  let prospectCreated: boolean;
  if (inserted.rows[0]) {
    prospectId = inserted.rows[0].id;
    prospectCreated = true;
  } else {
    const existing = await tx.query<{ id: string }>(
      `select id from public.recruitment_prospects where person_id = $1::uuid and season_id = $2::uuid`,
      [personId, seasonId],
    );
    prospectId = existing.rows[0].id;
    prospectCreated = false;
  }

  await recordAudit(tx, {
    actorPersonId,
    action: "recruitment_prospect.added_by_hand",
    entityTable: "recruitment_prospects",
    entityId: prospectId,
    context: {
      issue: "LAN-206",
      door: "operator_add",
      prospectCreated,
      optInEvidence: evidenceValue,
    },
  });

  let cycleDeclared = false;
  if (evidenceValue) {
    await tx.query(
      `insert into public.season_messaging_consents
         (person_id, season_id, state, source, changed_at, recorded_by_person_id)
       values ($1::uuid, $2::uuid, 'granted', 'operator_recorded', now(), $3::uuid)
       on conflict (person_id, season_id) do update
         set state = 'granted', source = excluded.source, changed_at = now(),
             recorded_by_person_id = excluded.recorded_by_person_id
       where public.season_messaging_consents.state <> 'withdrawn'
         and public.season_messaging_consents.state <> 'refused'`,
      [personId, seasonId, actorPersonId],
    );
    await declareRecruitmentCycleJobsIn(tx, personId, seasonId);
    cycleDeclared = true;
  }

  return { prospectId, prospectCreated, cycleDeclared };
}

export async function finishRecruitmentAdd(
  params: Parameters<typeof finishRecruitmentAddIn>[1],
): Promise<FinishRecruitmentAddResult> {
  return withTransaction((tx) => finishRecruitmentAddIn(tx, params));
}
