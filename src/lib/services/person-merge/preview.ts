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
 * per-tuple-unique combinations (`season_messaging_consents`,
 * `onboarding_agreements`, `person_fact_disputes`) `mergePersons` later
 * writes from the same read. LAN-185, `WP-operator-record` (LAN-217),
 * mission owner-question Q-3/Q-4/Q-5.
 */

export const CONTACT_KIND_SCOPE: Readonly<
  Record<MergeContactKind, { kind: "email" | "phone"; scope: "personal" | "college" | null }>
> = Object.freeze({
  mobile: { kind: "phone", scope: null },
  personal_email: { kind: "email", scope: "personal" },
  college_email: { kind: "email", scope: "college" },
});

/**
 * Whether a comparison row is a question the operator has to answer — LAN-256.
 *
 * Deliberately *not* `differs`. `differs` is B-004's warning chip and means
 * "both sides hold a value and those values disagree"; absence is not a
 * difference there, and that reading is Brian's. Whether the survivor keeps a
 * blank where the loser holds a value is a different question, and it is the
 * one an untouched merge used to answer by discarding the loser's record. A
 * choice is required whenever the two sides do not hold the same value, in
 * either direction.
 */
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
  /** LAN-256 — the two sides do not hold the same value, so the operator must say which the survivor keeps. */
  needsChoice: boolean;
}

interface MergeContactComparison {
  kind: MergeContactKind;
  label: string;
  survivor: { id: string; rawValue: string } | null;
  loser: { id: string; rawValue: string } | null;
  differs: boolean;
  /** LAN-256 — as on a plain field: not the same value on both sides, so it is a question. */
  needsChoice: boolean;
}

interface MergeAliasComparison {
  survivorAliases: string[];
  loserAliases: string[];
  /**
   * D-001 (correction round 3, Q-14, Brian): "differs" means two different
   * recorded values, applied here the honest way for a multi-valued field —
   * two alias *sets* that hold the same names, in any order, with any
   * duplication, are not a difference. `merge-comparison.tsx` used to
   * hardcode `differs={true}` unconditionally; this is the real computation
   * it now reads instead.
   */
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
  /** B-003 — one more operator-choosable row beside the fields and contacts above. */
  consentCombinations: MergeConsentCombination[];
  willMove: MergeMovementLine[];
  /**
   * `Q-16`: an archived season membership that cleared the overlap refusal
   * stays on the merged-away record — never re-pointed. Named here so the
   * confirmation screen says so plainly before the merge, per Brian's own
   * words.
   */
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

/**
 * D-001 (correction round 3, Q-14): the honest "differs" for a multi-valued
 * field. Aliases are a set, not an ordered list and not a single value — two
 * records that hold the same names, in any order and with any duplication
 * between them, are not a difference. Compared as sets rather than arrays for
 * exactly that reason.
 */
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

// LAN-201: `converted` -> `joined`, `lapsed` -> `disengaged`. `void` ranks
// below everything else — it marks a record as wrong rather than as a stage,
// so it never wins a merge combination over a status that says something real
// about the person; a legitimate rank on the other side survives, and two
// `void` sides tie exactly as before.
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

// ---------------------------------------------------------------------------
// Consent at a merge — `WP-operator-record` (LAN-217), mission
// owner-question Q-3/Q-4. B-003 (correction round 2, Q-10, Brian: "If it is
// a merge, they obviously get to choose") supersedes `T07-merge-precedence`,
// which locked the survivor to the most-restrictive state automatically —
// a recommendation, never an owner decision. `season_messaging_consents` is
// still unique on `(person_id, season_id)`, so a merge of two people who
// both hold a consent row for the same season still cannot keep both; which
// one survives is now the operator's own choice, like any other field or
// contact row on this same screen, defaulting to the survivor's own value
// when the operator makes no explicit choice — nothing is imposed.
// ---------------------------------------------------------------------------

export interface MergeConsentCombination {
  seasonId: string;
  seasonLabel: string;
  survivorState: string;
  loserState: string;
}

/** LAN-256 — a colliding consent row is a question exactly when the two states disagree. */
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
    // B-003: the operator's own choice. LAN-256: the fallback to the
    // survivor only ever applies where the two states already agree —
    // `assertEveryDifferenceAnswered` refuses the merge before this runs if a
    // colliding season's two states disagree and nobody answered for it.
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
    // Whichever side's value now stands is on the survivor's own row — the
    // loser's, superseded, is removed the same way a colliding prospect
    // season is: the current-state row collapses to one, and every actor
    // column naming who acted is already re-pointed blindly elsewhere
    // (`recorded_by_person_id`, in `PERSON_REFERENCE_COLUMNS`).
    await tx.query(
      `delete from public.season_messaging_consents where person_id = $1::uuid and season_id = $2::uuid`,
      [loserId, combo.seasonId],
    );
  }
  // Everything left on the loser has no counterpart on the survivor — a
  // plain re-point, safe because `season_messaging_consents_one_per_person_
  // per_season` cannot collide with a season already handled above.
  await tx.query(
    `update public.season_messaging_consents set person_id = $2::uuid where person_id = $1::uuid`,
    [loserId, survivorId],
  );
}

// ---------------------------------------------------------------------------
// Two more per-tuple-unique tables the mission's owner-question Q-3/Q-5
// assigned to this package to close, on the same "combine, then collapse to
// one current row" shape T07 above uses.
// ---------------------------------------------------------------------------

interface AgreementCombination {
  seasonId: string;
  agreementType: string;
}

/**
 * `onboarding_agreements` is keyed `(person_id, season_id, agreement_type)`.
 * There is no restrictive/permissive axis for "did they agree" the way
 * consent has one — so where two identities both hold an agreement for the
 * same season and type, the earlier `agreed_at` is what survives: the true
 * historical fact of when this person first agreed, the same "earliest date
 * is the real one" reasoning `readProspectCombinations`' own
 * `combinedFirstContact` already applies to a first-contact date.
 */
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

/**
 * `person_fact_disputes` allows at most one OPEN row per `(person_id,
 * field)`. Two identities can each hold an open dispute on the same field
 * only when both have separately been asked and separately answered
 * differently from the same club-recorded value — a genuine collision, not a
 * common case. Resolved rows never collide (the partial unique index only
 * covers `status = 'open'`), so only open-on-both-sides needs combining.
 *
 * The rule already governs a single person's own repeated answer — W7's own
 * exceptions-and-recovery note, "the newer answer supersedes the waiting
 * one" — and `raisePersonFactDisputeIn`'s own upsert already implements it by
 * overwriting the one open row in place rather than keeping two. Applied here
 * the same way: the more recently raised of the two open rows is the one that
 * survives, updated in place on the survivor's own row; the older, now
 * superseded, is removed exactly as an upsert would remove it — never
 * resolved, because resolving is a four-role decision this merge does not
 * make on anybody's behalf.
 */
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
  // Every other dispute the loser holds — resolved ones, and an open one on a
  // field the survivor has no open dispute on — has no counterpart to collide
  // with and re-points blindly.
  await tx.query(
    `update public.person_fact_disputes set person_id = $2::uuid where person_id = $1::uuid`,
    [loserId, survivorId],
  );
}

/**
 * `retainedMembershipIds` — `Q-16`'s archived overlap memberships — are
 * excluded from the "season membership" count: they will not move, so
 * counting them as "will move" would contradict `staysWithLoser`'s own note
 * on the same screen.
 */
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

/**
 * The whole comparison, read-only. `survivorPersonId` and `loserPersonId` are
 * the operator's current choice of which record survives — `W4-02`'s "Make
 * this the survivor" swaps which id is passed as which.
 */
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
        // B-004 (correction round 2, Brian): absence is not a difference. A
        // value compared against an absent (`null`) one on either side is not
        // recorded, not disputed — the warning chip fires only when both
        // sides actually hold a value and those values disagree.
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
        // D-001 (correction round 3, Q-14): the B-004 null guard on plain
        // fields (below) never reached this bare comparison — a present
        // value on one side and an absent one on the other read as
        // "differs" here too, which is what Brian saw on Mobile phone and
        // College email. Absence is not a difference on a contact any more
        // than it is on a plain field: the chip fires only when both sides
        // actually hold a value and those values disagree.
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
