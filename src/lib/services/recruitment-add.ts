import "server-only";

import { todayInClubZone } from "@/lib/club-time";
import { ConstraintViolated, InvalidTransition, type Tx } from "@/lib/db";
import { recordAudit } from "./audit";
import { declareRecruitmentCycleJobsIn } from "./recruitment-cycle";
import { addRecruitmentProspectNoteIn } from "./recruitment-prospect";
import { RECRUITMENT_ADD_OPT_IN_OPTIONS } from "./recruitment-vocabulary";

/**
 * `W6` — add a recruit by hand. LAN-206. The four shipped fields and the
 * duplicate check are `/operate/people/new`'s own (`findPersonDuplicates`,
 * `createPerson`), called and never duplicated. This module adds: the
 * Academic section, opt-in evidence, refusing a link onto an existing
 * player, and the capture-time cycle declaration. `createPerson` opens its
 * own transaction; this module's write is a second, separate one
 * immediately after — nothing here is undone if it fails.
 * Decision history: LAN-206, missions/intake/M-RECRUITMENT
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

/** `W6`'s "they already hold a membership" exception. Checked before `createPerson` runs, so a refused link writes nothing at all. */
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
  /** V-2: six more of the shipped intake fields, all optional, filled only while blank. */
  readonly knownAs?: string | null;
  readonly expectedGraduationYear?: string | null;
  readonly degreeField?: string | null;
  readonly dateOfBirth?: string | null;
  /** One subject (`person_emergency_contacts`' "one per person"); written once, only when a name is given. */
  readonly emergencyGivenName?: string | null;
  readonly emergencyFamilyName?: string | null;
  readonly emergencyRelationship?: string | null;
  readonly emergencyPhone?: string | null;
  readonly emergencyEmail?: string | null;
  readonly optInEvidence?: string | null;
  /** W6-01, F-206-02: optional, written as the recruit's first note via the shipped `addRecruitmentProspectNoteIn`. */
  readonly optInNote?: string | null;
}

async function fillPersonTextFieldIfBlankIn(
  tx: Tx,
  personId: string,
  column: "degree_field",
  value: string | null | undefined,
): Promise<void> {
  const trimmed = value?.trim() || null;
  if (!trimmed) return;
  await tx.query(
    `update public.people set ${column} = $2, updated_at = now() where id = $1::uuid and ${column} is null`,
    [personId, trimmed],
  );
}

async function fillPersonYearFieldIfBlankIn(
  tx: Tx,
  personId: string,
  column: "expected_graduation_year",
  value: string | null | undefined,
): Promise<void> {
  const trimmed = value?.trim() || null;
  if (!trimmed) return;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed) || parsed < 1900 || parsed > 2200) return;
  await tx.query(
    `update public.people set ${column} = $2, updated_at = now() where id = $1::uuid and ${column} is null`,
    [personId, parsed],
  );
}

const DATE_OF_BIRTH_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

async function fillDateOfBirthIfBlankIn(
  tx: Tx,
  personId: string,
  value: string | null | undefined,
): Promise<void> {
  const trimmed = value?.trim() || null;
  if (!trimmed || !DATE_OF_BIRTH_SHAPE.test(trimmed)) return;
  await tx.query(
    `update public.people set date_of_birth = $2::date, updated_at = now()
      where id = $1::uuid and date_of_birth is null`,
    [personId, trimmed],
  );
}

/** `person_emergency_contacts_one_per_person`: writes only when given name is supplied and no row exists yet. */
async function fillEmergencyContactIfNoneIn(
  tx: Tx,
  personId: string,
  actorPersonId: string,
  academic: RecruitmentAddAcademic,
): Promise<void> {
  const givenName = academic.emergencyGivenName?.trim() || null;
  if (!givenName) return;
  const existing = await tx.query(
    `select 1 from public.person_emergency_contacts where person_id = $1::uuid`,
    [personId],
  );
  if (existing.rows[0]) return;
  await tx.query(
    `insert into public.person_emergency_contacts
       (person_id, given_name, family_name, relationship, phone, email, recorded_by_person_id)
     values ($1::uuid, $2, $3, $4, $5, $6, $7::uuid)`,
    [
      personId,
      givenName,
      academic.emergencyFamilyName?.trim() || null,
      academic.emergencyRelationship?.trim() || null,
      academic.emergencyPhone?.trim() || null,
      academic.emergencyEmail?.trim() || null,
      actorPersonId,
    ],
  );
}

/** `recordKnownAsIn`'s own logic (`recruitment-signup.ts`) — a `person_aliases` row, only when it differs from the given name. */
async function fillKnownAsIfDifferentIn(
  tx: Tx,
  personId: string,
  givenName: string,
  knownAs: string | null | undefined,
): Promise<void> {
  const trimmed = knownAs?.trim() || null;
  if (!trimmed) return;
  if (trimmed.toLowerCase() === givenName.trim().toLowerCase()) return;
  const exists = await tx.query(
    `select 1 from public.person_aliases where person_id = $1::uuid and alias = $2`,
    [personId, trimmed],
  );
  if (exists.rows[0]) return;
  await tx.query(
    `update public.person_aliases set is_display_name = false
      where person_id = $1::uuid and is_display_name and alias <> $2`,
    [personId, trimmed],
  );
  await tx.query(
    `insert into public.person_aliases (person_id, alias, source, is_display_name)
     values ($1::uuid, $2, $3, true)
     on conflict (person_id, alias) do update set is_display_name = true`,
    [personId, trimmed, "recruitment operator add (LAN-206)"],
  );
}

export interface FinishRecruitmentAddResult {
  readonly prospectId: string;
  readonly prospectCreated: boolean;
  readonly cycleDeclared: boolean;
}

/** Everything after `createPerson`: Academic fields, the prospect row, opt-in evidence, and — only once evidence exists — the consent grant and cycle declaration. */
export async function finishRecruitmentAddIn(
  tx: Tx,
  params: {
    actorPersonId: string;
    personId: string;
    givenName: string;
    seasonId: string;
    academic: RecruitmentAddAcademic;
  },
): Promise<FinishRecruitmentAddResult> {
  const { actorPersonId, personId, givenName, seasonId, academic } = params;

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
  await fillKnownAsIfDifferentIn(tx, personId, givenName, academic.knownAs);
  await fillPersonTextFieldIfBlankIn(tx, personId, "degree_field", academic.degreeField);
  await fillPersonYearFieldIfBlankIn(
    tx,
    personId,
    "expected_graduation_year",
    academic.expectedGraduationYear,
  );
  await fillDateOfBirthIfBlankIn(tx, personId, academic.dateOfBirth);
  await fillEmergencyContactIfNoneIn(tx, personId, actorPersonId, academic);

  const evidenceValue = academic.optInEvidence?.trim() || null;
  const evidenceLabel = evidenceValue ? (OPT_IN_LABEL.get(evidenceValue) ?? null) : null;

  // first_contact_on is today: the operator is typing this recruit in because the club just met them (LAN-247).
  const inserted = await tx.query<{ id: string }>(
    `insert into public.recruitment_prospects (person_id, season_id, source, first_contact_on)
     values ($1::uuid, $2::uuid, $3, $4::date)
     on conflict (person_id, season_id) do nothing
     returning id`,
    [
      personId,
      seasonId,
      evidenceLabel ? `Operator add · ${evidenceLabel}` : "Operator add",
      todayInClubZone(),
    ],
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

  const optInNote = academic.optInNote?.trim() || null;
  if (optInNote) {
    await addRecruitmentProspectNoteIn(
      tx,
      actorPersonId,
      prospectId,
      `How we came by this number: ${optInNote}`,
    );
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
      optInNoteRecorded: Boolean(optInNote),
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
