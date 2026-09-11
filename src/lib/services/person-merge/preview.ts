import { ConstraintViolated, NotFound, withTransaction, type Tx } from "@/lib/db";
import type { EmergencyContact, PersonContactValue, PersonRecord } from "../person-record";
import { personDisplayNameSql } from "../sql-text";
import { checkMergeRefusal, readMergeSide, type MergeRefusal } from "./eligibility";
import {
  MERGE_CONTACT_KIND_LABELS,
  MERGE_PERSON_FIELD_LABELS,
  type MergeChoice,
  type MergeContactKind,
  type MergePersonField,
} from "./types";

/**
 * Preview — W4-02 through W4-08's comparison and "what will move", plus the
 * per-tuple-unique combinations `mergePersons` later writes from the same
 * read (`season_messaging_consents`, `onboarding_agreements`,
 * `person_fact_disputes`). LAN-185, LAN-217, Q-3/Q-4/Q-5.
 * Decision history: LAN-185, LAN-217, missions/intake/M-PEOPLE-AND-ROSTER
 */

export const CONTACT_KIND_SCOPE: Readonly<
  Record<MergeContactKind, { kind: "email" | "phone"; scope: "personal" | "college" | null }>
> = Object.freeze({
  mobile: { kind: "phone", scope: null },
  personal_email: { kind: "email", scope: "personal" },
  college_email: { kind: "email", scope: "college" },
});

/** Whether a comparison row is a question the operator has to answer (LAN-256) — deliberately not `differs`, which fires only when both sides hold a disagreeing value. */
export function needsChoiceBetween(
  survivorValue: string | null,
  loserValue: string | null,
): boolean {
  return survivorValue !== loserValue;
}

interface MergeFieldComparison {
  field: MergePersonField;
  label: string;
  survivorValue: string | null;
  loserValue: string | null;
  differs: boolean;
  needsChoice: boolean;
}

interface MergeContactComparison {
  kind: MergeContactKind;
  label: string;
  survivor: { id: string; rawValue: string } | null;
  loser: { id: string; rawValue: string } | null;
  differs: boolean;
  needsChoice: boolean;
}

interface MergeAliasComparison {
  survivorAliases: string[];
  loserAliases: string[];
  /** D-001: alias sets compared as sets, not ordered lists — order/duplication is not a difference. */
  differs: boolean;
}

export interface MergeProspectCombination {
  seasonId: string;
  seasonLabel: string;
  survivorStatus: string;
  loserStatus: string;
  combinedStatus: string;
  combinedCommittedOn: string | null;
  survivorFirstContact: string | null;
  loserFirstContact: string | null;
  combinedFirstContact: string | null;
}

interface MergeMovementLine {
  label: string;
  count: number;
}

export interface PersonMergePreview {
  survivor: { personId: string; displayName: string; statusLabel: string | null; createdAt: Date };
  loser: { personId: string; displayName: string; statusLabel: string | null; createdAt: Date };
  refusal: MergeRefusal | null;
  fields: MergeFieldComparison[];
  contacts: MergeContactComparison[];
  aliases: MergeAliasComparison;
  prospectCombinations: MergeProspectCombination[];
  consentCombinations: MergeConsentCombination[];
  willMove: MergeMovementLine[];
  /** Q-16: an archived overlap membership stays with the loser, never re-pointed. */
  staysWithLoser: { seasonLabel: string }[];
}

export function fieldValue(record: PersonRecord, field: MergePersonField): string | null {
  if (field === "emergency_contact") return emergencyContactLine(record.emergencyContact);
  const value =
    record[
      field === "given_name"
        ? "givenName"
        : field === "family_name"
          ? "familyName"
          : field === "college"
            ? "college"
            : field === "matriculation_year"
              ? "matriculationYear"
              : field === "expected_graduation_year"
                ? "expectedGraduationYear"
                : field === "degree_field"
                  ? "degreeField"
                  : "dateOfBirth"
    ];
  return value === null || value === undefined ? null : String(value);
}

function emergencyContactLine(ec: EmergencyContact | null): string | null {
  if (!ec) return null;
  const name = [ec.givenName, ec.familyName].filter(Boolean).join(" ");
  return ec.relationship ? `${name} · ${ec.relationship}` : name;
}

/** D-001: aliases are a set, not an ordered list — compared as sets. */
function aliasSetsDiffer(
  survivorAliases: readonly string[],
  loserAliases: readonly string[],
): boolean {
  const survivorSet = new Set(survivorAliases);
  const loserSet = new Set(loserAliases);
  if (survivorSet.size !== loserSet.size) return true;
  for (const alias of survivorSet) {
    if (!loserSet.has(alias)) return true;
  }
  return false;
}

export function currentPreferred(
  record: PersonRecord,
  kind: MergeContactKind,
): PersonContactValue | null {
  const { kind: k, scope } = CONTACT_KIND_SCOPE[kind];
  return (
    record.contacts.find(
      (c) => c.kind === k && c.scope === scope && c.validUntil === null && c.isPreferred,
    ) ?? null
  );
}

// LAN-201. `void` ranks below everything else — it marks a record as wrong, not a stage, and never wins over a real one.
const PROSPECT_STATUS_RANK: Readonly<Record<string, number>> = Object.freeze({
  void: -1,
  declined: 0,
  identified: 1,
  disengaged: 1,
  engaged: 2,
  committed: 3,
  joined: 4,
});

export async function readProspectCombinations(
  tx: Tx,
  survivorId: string,
  loserId: string,
): Promise<MergeProspectCombination[]> {
  const result = await tx.query<{
    season_id: string;
    season_label: string;
    survivor_status: string | null;
    loser_status: string | null;
    survivor_first_contact: string | null;
    loser_first_contact: string | null;
    survivor_committed_on: string | null;
    loser_committed_on: string | null;
  }>(
    `select s.id as season_id, s.label as season_label,
            a.status::text as survivor_status, b.status::text as loser_status,
            to_char(a.first_contact_on, 'YYYY-MM-DD') as survivor_first_contact,
            to_char(b.first_contact_on, 'YYYY-MM-DD') as loser_first_contact,
            to_char(a.committed_on, 'YYYY-MM-DD') as survivor_committed_on,
            to_char(b.committed_on, 'YYYY-MM-DD') as loser_committed_on
       from public.recruitment_prospects a
       join public.recruitment_prospects b
         on b.season_id = a.season_id and b.person_id = $2::uuid
       join public.seasons s on s.id = a.season_id
      where a.person_id = $1::uuid`,
    [survivorId, loserId],
  );

  return result.rows.map((row) => {
    const survivorRank = PROSPECT_STATUS_RANK[row.survivor_status ?? ""] ?? 0;
    const loserRank = PROSPECT_STATUS_RANK[row.loser_status ?? ""] ?? 0;
    const survivorWins = survivorRank >= loserRank;
    const combinedStatus = survivorWins ? row.survivor_status! : row.loser_status!;
    // `recruitment_prospects_commitment_is_dated`: `committed`/`joined`
    // need a `committed_on`. Taken from whichever side's status is winning —
    // the one side that could actually have set it truthfully.
    const combinedCommittedOn = survivorWins ? row.survivor_committed_on : row.loser_committed_on;
    const combinedFirstContact =
      row.survivor_first_contact && row.loser_first_contact
        ? row.survivor_first_contact < row.loser_first_contact
          ? row.survivor_first_contact
          : row.loser_first_contact
        : (row.survivor_first_contact ?? row.loser_first_contact);
    return {
      seasonId: row.season_id,
      seasonLabel: row.season_label,
      survivorStatus: row.survivor_status ?? "identified",
      loserStatus: row.loser_status ?? "identified",
      combinedStatus,
      combinedCommittedOn,
      survivorFirstContact: row.survivor_first_contact,
      loserFirstContact: row.loser_first_contact,
      combinedFirstContact,
    };
  });
}

// Consent at a merge — LAN-217, Q-3/Q-4. B-003: the operator chooses which of a colliding pair
// survives (season_messaging_consents is unique on (person_id, season_id)), defaulting to the
// survivor's own value when unanswered.

export interface MergeConsentCombination {
  seasonId: string;
  seasonLabel: string;
  survivorState: string;
  loserState: string;
}

export function consentNeedsChoice(combo: MergeConsentCombination): boolean {
  return combo.survivorState !== combo.loserState;
}

/** Per-season operator choice for a colliding consent row — `consent_<seasonId>` on the merge form. */
export type MergeConsentChoices = Partial<Record<string, MergeChoice>>;

export async function readConsentCombinations(
  tx: Tx,
  survivorId: string,
  loserId: string,
): Promise<MergeConsentCombination[]> {
  const result = await tx.query<{
    season_id: string;
    season_label: string;
    survivor_state: string;
    loser_state: string;
  }>(
    `select s.id as season_id, s.label as season_label,
            a.state::text as survivor_state, b.state::text as loser_state
       from public.season_messaging_consents a
       join public.season_messaging_consents b
         on b.season_id = a.season_id and b.person_id = $2::uuid
       join public.seasons s on s.id = a.season_id
      where a.person_id = $1::uuid`,
    [survivorId, loserId],
  );

  return result.rows.map((row) => ({
    seasonId: row.season_id,
    seasonLabel: row.season_label,
    survivorState: row.survivor_state,
    loserState: row.loser_state,
  }));
}

export async function repointConsents(
  tx: Tx,
  survivorId: string,
  loserId: string,
  combinations: readonly MergeConsentCombination[],
  choices: MergeConsentChoices,
): Promise<void> {
  for (const combo of combinations) {
    // B-003: the fallback to survivor only applies where the states already agree (LAN-256).
    if ((choices[combo.seasonId] ?? "survivor") === "loser") {
      await tx.query(
        `update public.season_messaging_consents a
            set state = b.state, source = b.source, changed_at = b.changed_at,
                recorded_by_person_id = b.recorded_by_person_id
           from public.season_messaging_consents b
          where a.person_id = $1::uuid and a.season_id = $3::uuid
            and b.person_id = $2::uuid and b.season_id = $3::uuid`,
        [survivorId, loserId, combo.seasonId],
      );
    }
    // Superseded row removed; the current-state row collapses to one.
    await tx.query(
      `delete from public.season_messaging_consents where person_id = $1::uuid and season_id = $2::uuid`,
      [loserId, combo.seasonId],
    );
  }
  // Everything left has no counterpart on the survivor — a plain re-point.
  await tx.query(
    `update public.season_messaging_consents set person_id = $2::uuid where person_id = $1::uuid`,
    [loserId, survivorId],
  );
}

interface AgreementCombination {
  seasonId: string;
  agreementType: string;
}

/** Keyed `(person_id, season_id, agreement_type)`. Earlier `agreed_at` survives — the true first-agreed date. */
export async function repointAgreements(
  tx: Tx,
  survivorId: string,
  loserId: string,
): Promise<void> {
  const colliding = await tx.query<{
    season_id: string;
    agreement_type: string;
    survivor_agreed_at: Date;
    loser_agreed_at: Date;
    loser_agreement_version_id: string;
  }>(
    `select a.season_id, a.agreement_type::text as agreement_type,
            a.agreed_at as survivor_agreed_at, b.agreed_at as loser_agreed_at,
            b.agreement_version_id as loser_agreement_version_id
       from public.onboarding_agreements a
       join public.onboarding_agreements b
         on b.season_id = a.season_id and b.agreement_type = a.agreement_type and b.person_id = $2::uuid
      where a.person_id = $1::uuid`,
    [survivorId, loserId],
  );

  const combinations: AgreementCombination[] = [];
  for (const row of colliding.rows) {
    combinations.push({ seasonId: row.season_id, agreementType: row.agreement_type });
    const loserIsEarlier = row.loser_agreed_at < row.survivor_agreed_at;
    if (loserIsEarlier) {
      await tx.query(
        `update public.onboarding_agreements
            set agreed_at = $4, agreement_version_id = $5::uuid
          where person_id = $1::uuid and season_id = $2::uuid and agreement_type = $3::public.onboarding_agreement_type`,
        [
          survivorId,
          row.season_id,
          row.agreement_type,
          row.loser_agreed_at,
          row.loser_agreement_version_id,
        ],
      );
    }
    await tx.query(
      `delete from public.onboarding_agreements
        where person_id = $1::uuid and season_id = $2::uuid and agreement_type = $3::public.onboarding_agreement_type`,
      [loserId, row.season_id, row.agreement_type],
    );
  }
  await tx.query(
    `update public.onboarding_agreements set person_id = $2::uuid where person_id = $1::uuid`,
    [loserId, survivorId],
  );
}

/** At most one OPEN row per `(person_id, field)`. The more recently raised of a colliding pair survives, in place; the older is removed, never resolved (a four-role decision this merge does not make). */
export async function repointDisputes(tx: Tx, survivorId: string, loserId: string): Promise<void> {
  const colliding = await tx.query<{
    field: string;
    survivor_raised_at: Date;
    loser_raised_at: Date;
  }>(
    `select a.field, a.raised_at as survivor_raised_at, b.raised_at as loser_raised_at
       from public.person_fact_disputes a
       join public.person_fact_disputes b
         on b.field = a.field and b.person_id = $2::uuid and b.status = 'open'
      where a.person_id = $1::uuid and a.status = 'open'`,
    [survivorId, loserId],
  );

  for (const row of colliding.rows) {
    if (row.loser_raised_at > row.survivor_raised_at) {
      await tx.query(
        `update public.person_fact_disputes a
            set club_value = b.club_value, player_value = b.player_value,
                raised_by_person_id = b.raised_by_person_id, raised_at = b.raised_at
           from public.person_fact_disputes b
          where a.person_id = $1::uuid and a.field = $3
            and b.person_id = $2::uuid and b.field = $3 and b.status = 'open'`,
        [survivorId, loserId, row.field],
      );
    }
    await tx.query(
      `delete from public.person_fact_disputes
        where person_id = $1::uuid and field = $2 and status = 'open'`,
      [loserId, row.field],
    );
  }
  // Everything else re-points blindly — no counterpart to collide with.
  await tx.query(
    `update public.person_fact_disputes set person_id = $2::uuid where person_id = $1::uuid`,
    [loserId, survivorId],
  );
}

/** `retainedMembershipIds` (Q-16's archived overlap memberships) are excluded — they will not move. */
export async function readWillMove(
  tx: Tx,
  loserId: string,
  retainedMembershipIds: readonly string[],
): Promise<MergeMovementLine[]> {
  const counts = await tx.query<{
    memberships: string;
    prospects: string;
    roles: string;
    contacts: string;
    rsvps: string;
    attendance: string;
    history: string;
  }>(
    `select
       (select count(*) from public.season_memberships
         where person_id = $1::uuid and not (id = any($2::uuid[]))) as memberships,
       (select count(*) from public.recruitment_prospects where person_id = $1::uuid) as prospects,
       (select count(*) from public.role_assignments where person_id = $1::uuid) as roles,
       (select count(*) from public.contact_points where person_id = $1::uuid) as contacts,
       (select count(*) from public.rsvp_responses r
          join public.invitations i on i.id = r.invitation_id
         where i.person_id = $1::uuid) as rsvps,
       (select count(*) from public.attendance_records where person_id = $1::uuid) as attendance,
       (select count(*) from public.audit_events where entity_table = 'people' and entity_id = $1::uuid) as history
     `,
    [loserId, retainedMembershipIds],
  );
  const row = counts.rows[0];
  const line = (label: string, value: string): MergeMovementLine | null => {
    const count = Number(value);
    return count > 0 ? { label, count } : null;
  };
  return [
    line("season membership", row.memberships),
    line("prospect record", row.prospects),
    line("role assignment", row.roles),
    line("contact point", row.contacts),
    line("RSVP", row.rsvps),
    line("attendance record", row.attendance),
    line("history entry", row.history),
  ].filter((l): l is MergeMovementLine => l !== null);
}

export async function readSideLabelIn(
  tx: Tx,
  personId: string,
): Promise<{ displayName: string; createdAt: Date }> {
  const result = await tx.query<{ display_name: string; created_at: Date }>(
    `select ${personDisplayNameSql("p")} as display_name, p.created_at
       from public.people p where p.id = $1::uuid`,
    [personId],
  );
  const row = result.rows[0];
  return { displayName: row?.display_name ?? "Unknown", createdAt: row?.created_at ?? new Date() };
}

/** The whole comparison, read-only. `survivorPersonId`/`loserPersonId` swap on `W4-02`'s "Make this the survivor". */
export async function previewPersonMerge(
  survivorPersonId: string,
  loserPersonId: string,
): Promise<PersonMergePreview> {
  return withTransaction(async (tx) => {
    if (survivorPersonId === loserPersonId) {
      throw new ConstraintViolated("A record cannot be merged with itself.", {
        rule: "person_merge_same_record",
      });
    }
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

    const fields: MergeFieldComparison[] = (
      Object.keys(MERGE_PERSON_FIELD_LABELS) as MergePersonField[]
    ).map((field) => {
      const survivorValue = fieldValue(survivorSide.record, field);
      const loserValue = fieldValue(loserSide.record, field);
      return {
        field,
        label: MERGE_PERSON_FIELD_LABELS[field],
        survivorValue,
        loserValue,
        // B-004: absence is not a difference — fires only when both sides hold a disagreeing value.
        differs: survivorValue !== null && loserValue !== null && survivorValue !== loserValue,
        needsChoice: needsChoiceBetween(survivorValue, loserValue),
      };
    });

    const contacts: MergeContactComparison[] = (
      Object.keys(MERGE_CONTACT_KIND_LABELS) as MergeContactKind[]
    ).map((kind) => {
      const survivor = currentPreferred(survivorSide.record, kind);
      const loser = currentPreferred(loserSide.record, kind);
      return {
        kind,
        label: MERGE_CONTACT_KIND_LABELS[kind],
        survivor: survivor ? { id: survivor.id, rawValue: survivor.rawValue } : null,
        loser: loser ? { id: loser.id, rawValue: loser.rawValue } : null,
        // D-001: same B-004 null guard, extended to contacts (Mobile phone, College email).
        differs: survivor !== null && loser !== null && survivor.rawValue !== loser.rawValue,
        needsChoice: needsChoiceBetween(survivor?.rawValue ?? null, loser?.rawValue ?? null),
      };
    });

    const survivorLabel = await readSideLabelIn(tx, survivorPersonId);
    const loserLabel = await readSideLabelIn(tx, loserPersonId);

    return {
      survivor: {
        personId: survivorPersonId,
        displayName: survivorLabel.displayName,
        statusLabel: survivorSide.record.status,
        createdAt: survivorLabel.createdAt,
      },
      loser: {
        personId: loserPersonId,
        displayName: loserLabel.displayName,
        statusLabel: loserSide.record.status,
        createdAt: loserLabel.createdAt,
      },
      refusal,
      fields,
      contacts,
      aliases: (() => {
        const survivorAliases = survivorSide.record.aliases.map((a) => a.alias);
        const loserAliases = loserSide.record.aliases.map((a) => a.alias);
        return {
          survivorAliases,
          loserAliases,
          differs: aliasSetsDiffer(survivorAliases, loserAliases),
        };
      })(),
      prospectCombinations: refusal
        ? []
        : await readProspectCombinations(tx, survivorPersonId, loserPersonId),
      consentCombinations: refusal
        ? []
        : await readConsentCombinations(tx, survivorPersonId, loserPersonId),
      willMove: refusal
        ? []
        : await readWillMove(
            tx,
            loserPersonId,
            retainedMemberships.map((m) => m.membershipId),
          ),
      staysWithLoser: refusal
        ? []
        : retainedMemberships.map((m) => ({ seasonLabel: m.seasonLabel })),
    };
  });
}
