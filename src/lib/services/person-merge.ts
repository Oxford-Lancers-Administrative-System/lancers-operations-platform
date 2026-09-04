import "server-only";

import { ConstraintViolated, NotFound, withTransaction, type Tx } from "@/lib/db";
import { actorRequirement } from "./actor";
import { recordAudit } from "./audit";
import {
  type EmergencyContact,
  type PersonContactValue,
  type PersonRecord,
  readPersonRecordIn,
} from "./person-record";
import { updateEmergencyContactField, updatePersonField } from "./person-write";
import { personDisplayNameSql } from "./sql-text";

/**
 * W4 — merge two records for the same human. LAN-185, `REQ-merge`, invariant
 * I6, and `Q-5` (Brian, checkpoint 2026-08-29 — the exact shape this module
 * builds):
 *
 * > Merge refuses on an active operator seat on the losing record, refuses on
 * > two memberships in one season, requires a reason, shows exactly what will
 * > move before it moves, and offers no undo afterwards. The losing row is
 * > kept, dated and re-pointed at the survivor so a manual repair stays
 * > possible, and the confirmation says plainly that there is no undo.
 *
 * `Q-16` (Brian, correction round 2 — `evaluateSeasonOverlap()` below builds
 * this) narrows `Q-5`'s season-overlap refusal from a dead end into a real
 * path forward: the refusal names the season, links to the loser's own
 * membership, and clears once that membership is archived — at which point
 * the merge proceeds and that one membership, alone, stays on the loser.
 *
 * ## Field application reuses the ordinary correction path
 *
 * The workflow's own words: "Chosen field values are written onto the
 * survivor, each one an ordinary audited correction so the change history
 * reads honestly." `withTransaction` joins a nested call to the *same*
 * transaction rather than opening a second one (`transaction.ts`'s own
 * guarantee), so this module calls `person-write.ts`'s
 * `updatePersonField()`/`updateEmergencyContactField()`/
 * `supersedeContactPoint()` directly for every field the operator chose to
 * take from the losing record — they run inside the merge's own transaction,
 * write the same `person_<field>_updated` / `person_contact_superseded`
 * audit rows an ordinary edit would, and roll back with everything else if
 * anything downstream refuses. Nothing here re-implements field validation or
 * the reason rule a second time.
 *
 * ## Which references are re-pointed
 *
 * "Mechanical; the set is every foreign key to `people`" (delegated to the
 * Mission Lead). `PERSON_REFERENCE_COLUMNS` below is that set, minus three
 * kinds of exception, each named where it is excluded or special-cased:
 * `people.merged_*_person_id` (the merge event's own columns),
 * `operator_accounts.person_id` (a login/seat — Mission 1's, and the reason
 * the active-seat refusal exists at all), and the tables whose *shape* the
 * merge changes rather than a plain re-point: `contact_points`,
 * `person_aliases`, `person_emergency_contacts`, `recruitment_prospects`,
 * `season_memberships` — the last since `Q-16` (correction round 2), which
 * excludes one specific membership (the overlap season the operator archived
 * to clear the refusal) rather than every row on the loser — and three
 * tables `WP-operator-record` (LAN-217, mission owner-question Q-3/Q-4/Q-5)
 * closed a documented gap on: `season_messaging_consents`, keyed
 * `(person_id, season_id)`, combined per season with the most restrictive
 * state winning (`T07-merge-precedence`, `repointConsents`);
 * `onboarding_agreements`, keyed `(person_id, season_id, agreement_type)`,
 * combined with the earlier `agreed_at` winning (`repointAgreements`); and
 * `person_fact_disputes`, at most one OPEN row per `(person_id, field)`,
 * combined with the more recently raised open dispute surviving
 * (`repointDisputes`) — none of the three is a silent re-point, and none is
 * a known limitation any more.
 * `tests/person-merge-reference-catalogue.test.ts` asks `pg_constraint` for
 * the real, current list and fails if this module's declared set has drifted
 * from it — "ask the catalogue, not the migrations."
 */

// ---------------------------------------------------------------------------
// The comparable fields — every durable person fact but the contact points,
// which compare separately because there can be more than one kind.
// ---------------------------------------------------------------------------

export type MergePersonField =
  | "given_name"
  | "family_name"
  | "college"
  | "matriculation_year"
  | "expected_graduation_year"
  | "degree_field"
  | "date_of_birth"
  | "emergency_contact";

export const MERGE_PERSON_FIELD_LABELS: Readonly<Record<MergePersonField, string>> = Object.freeze({
  given_name: "First name",
  family_name: "Last name",
  college: "College",
  matriculation_year: "Matriculation year",
  expected_graduation_year: "Expected graduation",
  degree_field: "Degree field",
  date_of_birth: "Date of birth",
  emergency_contact: "Emergency contact",
});

export type MergeContactKind = "mobile" | "personal_email" | "college_email";

const CONTACT_KIND_SCOPE: Readonly<
  Record<MergeContactKind, { kind: "email" | "phone"; scope: "personal" | "college" | null }>
> = Object.freeze({
  mobile: { kind: "phone", scope: null },
  personal_email: { kind: "email", scope: "personal" },
  college_email: { kind: "email", scope: "college" },
});

export const MERGE_CONTACT_KIND_LABELS: Readonly<Record<MergeContactKind, string>> = Object.freeze({
  mobile: "Mobile phone",
  personal_email: "Personal email",
  college_email: "College email",
});

export type MergeChoice = "survivor" | "loser";

/** Every field an operator may choose per-side for. Undeclared means "keep the survivor's own value". */
export type MergeFieldChoices = Partial<Record<MergePersonField, MergeChoice>> &
  Partial<Record<MergeContactKind, MergeChoice>>;

// ---------------------------------------------------------------------------
// Eligibility — the two refusals `Q-5` names, read-only
// ---------------------------------------------------------------------------

export interface MergeRefusal {
  rule: string;
  message: string;
  /**
   * `Q-16` (Brian, correction round 2): the season-overlap refusal names the
   * exact membership to archive and links to it — one entry per season still
   * blocking the merge. Absent for the active-operator-seat refusal, which
   * already links to Mission 1's administration surface generically.
   */
  blockingMemberships?: { seasonLabel: string; membershipId: string }[];
}

/** One season where both records hold a membership — `Q-16`'s overlap check. */
interface SeasonOverlap {
  seasonId: string;
  seasonLabel: string;
  loserMembershipId: string;
  loserStatus: string;
}

/**
 * An overlap `Q-16` resolves by archiving rather than by refusing — the
 * loser's own membership row, named so both the preview's `staysWithLoser`
 * note and the write's re-point exclusion can use the same id.
 */
interface RetainedMembership {
  seasonId: string;
  seasonLabel: string;
  membershipId: string;
}

async function readMergeSide(
  tx: Tx,
  personId: string,
): Promise<{ record: PersonRecord; createdAt: Date } | null> {
  const row = await tx.query<{ merged_into_person_id: string | null; created_at: Date }>(
    `select merged_into_person_id, created_at from public.people where id = $1::uuid`,
    [personId],
  );
  if (!row.rows[0]) return null;
  if (row.rows[0].merged_into_person_id) return null;
  return { record: await readPersonRecordIn(tx, personId), createdAt: row.rows[0].created_at };
}

/**
 * Every season where both the survivor and the loser hold a membership,
 * naming the loser's own membership row and its status — the input both the
 * refusal and the write's exclusion (below) are computed from.
 */
async function findSeasonOverlaps(
  tx: Tx,
  survivorId: string,
  loserId: string,
): Promise<SeasonOverlap[]> {
  const result = await tx.query<{
    season_id: string;
    label: string;
    loser_membership_id: string;
    status: string;
  }>(
    `select s.id as season_id, s.label, b.id as loser_membership_id, b.status
       from public.season_memberships a
       join public.season_memberships b
         on b.season_id = a.season_id and b.person_id = $2::uuid
       join public.seasons s on s.id = a.season_id
      where a.person_id = $1::uuid`,
    [survivorId, loserId],
  );
  return result.rows.map((row) => ({
    seasonId: row.season_id,
    seasonLabel: row.label,
    loserMembershipId: row.loser_membership_id,
    loserStatus: row.status,
  }));
}

/**
 * `Q-16` (Brian, correction round 2, superseding the original season-overlap
 * refusal): "A merge may proceed once the losing record's membership for the
 * shared season is archived. The refusal says so explicitly: it names the
 * season, links to that membership, and tells the operator to archive it on
 * the roster before merging." An overlap whose loser-side status is already
 * `archived` is not a refusal — it is returned as `retained` instead, so the
 * caller can exclude that one membership row from the re-point (below) and
 * report that it stays with the loser.
 */
async function evaluateSeasonOverlap(
  tx: Tx,
  survivorId: string,
  loserId: string,
): Promise<{
  refusal: MergeRefusal | null;
  retained: RetainedMembership[];
}> {
  const overlaps = await findSeasonOverlaps(tx, survivorId, loserId);
  const blocking = overlaps.filter((o) => o.loserStatus !== "archived");
  const retained = overlaps
    .filter((o) => o.loserStatus === "archived")
    .map((o) => ({
      seasonId: o.seasonId,
      seasonLabel: o.seasonLabel,
      membershipId: o.loserMembershipId,
    }));

  if (blocking.length === 0) return { refusal: null, retained };

  const labels = blocking.map((b) => b.seasonLabel).join(", ");
  return {
    refusal: {
      rule: "person_merge_membership_overlap",
      message:
        `Both records hold a membership for ${labels}. Archive the losing record's ` +
        `membership for ${labels} on the roster before merging.`,
      blockingMemberships: blocking.map((b) => ({
        seasonLabel: b.seasonLabel,
        membershipId: b.loserMembershipId,
      })),
    },
    retained,
  };
}

/**
 * The two refusals `Q-5` names, checked read-only — used by the preview
 * screen so a refusal renders without attempting a write, and re-checked
 * (under a real lock) inside `mergePersons()` itself, because a preview is
 * never authoritative under a race.
 */
async function checkMergeRefusal(
  tx: Tx,
  survivorId: string,
  loserId: string,
): Promise<{
  refusal: MergeRefusal | null;
  retainedMemberships: RetainedMembership[];
}> {
  const seat = await tx.query<{ id: string }>(
    `select id from public.operator_accounts where person_id = $1::uuid and is_active`,
    [loserId],
  );
  if (seat.rows.length > 0) {
    return {
      refusal: {
        rule: "person_merge_active_operator_seat",
        message:
          "This record holds an active operator seat. End the seat before merging — Mission 1's administration surface.",
      },
      retainedMemberships: [],
    };
  }

  const overlap = await evaluateSeasonOverlap(tx, survivorId, loserId);
  return { refusal: overlap.refusal, retainedMemberships: overlap.retained };
}

// ---------------------------------------------------------------------------
// Preview — W4-02 through W4-08's comparison and "what will move"
// ---------------------------------------------------------------------------

export interface MergeFieldComparison {
  field: MergePersonField;
  label: string;
  survivorValue: string | null;
  loserValue: string | null;
  differs: boolean;
}

export interface MergeContactComparison {
  kind: MergeContactKind;
  label: string;
  survivor: { id: string; rawValue: string } | null;
  loser: { id: string; rawValue: string } | null;
  differs: boolean;
}

export interface MergeAliasComparison {
  survivorAliases: string[];
  loserAliases: string[];
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

export interface MergeMovementLine {
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
  /** `T07-merge-precedence` — one more line beside the prospect combinations, for the same reason. */
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

function fieldValue(record: PersonRecord, field: MergePersonField): string | null {
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

function currentPreferred(record: PersonRecord, kind: MergeContactKind): PersonContactValue | null {
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

async function readProspectCombinations(
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
// T07-merge-precedence — `WP-operator-record` (LAN-217), mission
// owner-question Q-3/Q-4, `W7`'s own acceptance locked at the recommendation.
//
// `season_messaging_consents` is unique on `(person_id, season_id)`, so a
// merge of two people who both hold a consent row for the same season cannot
// keep both. The recommendation, locked as written: the survivor takes the
// MOST RESTRICTIVE state, never the most recent — if either record says
// `refused` or `withdrawn`, the survivor is `refused` or `withdrawn`.
// Consent is permission to contact somebody, and a record-keeping operation
// — a merge — must never manufacture permission a person actually declined.
// `refused` and `withdrawn` rank equally restrictive; between two equally
// restrictive rows, the more recent decision governs, the same way a person
// re-answering their own consent always does (`grantSeasonMessagingConsentIn`/
// `withdrawSeasonMessagingConsentIn`, both `changed_at = now()`).
// ---------------------------------------------------------------------------

const CONSENT_RESTRICTIVE_STATES: ReadonlySet<string> = new Set(["refused", "withdrawn"]);

/** Higher wins among the three non-restrictive states — a real signal beats none, `granted` beats an unanswered ask. */
const CONSENT_STATE_RANK: Readonly<Record<string, number>> = Object.freeze({
  never_asked: 0,
  asked: 1,
  granted: 2,
});

export interface MergeConsentCombination {
  seasonId: string;
  seasonLabel: string;
  survivorState: string;
  loserState: string;
  combinedState: string;
  /** `true` when the combined state came from the loser's row rather than the survivor's own. */
  fromLoser: boolean;
}

interface ConsentRow {
  state: string;
  source: string | null;
  changed_at: Date;
}

/** The row that wins T07's precedence — restrictive beats permissive, and the newer decision breaks a restrictive tie. */
function combineConsentRows(
  survivor: ConsentRow,
  loser: ConsentRow,
): { row: ConsentRow; fromLoser: boolean } {
  const survivorRestrictive = CONSENT_RESTRICTIVE_STATES.has(survivor.state);
  const loserRestrictive = CONSENT_RESTRICTIVE_STATES.has(loser.state);
  if (survivorRestrictive && !loserRestrictive) return { row: survivor, fromLoser: false };
  if (loserRestrictive && !survivorRestrictive) return { row: loser, fromLoser: true };
  if (survivorRestrictive && loserRestrictive) {
    // Both declined contact; the more recent decision is the one the person
    // actually holds today.
    return survivor.changed_at >= loser.changed_at
      ? { row: survivor, fromLoser: false }
      : { row: loser, fromLoser: true };
  }
  // Neither is restrictive — the more informative non-restrictive state wins;
  // the survivor's own row keeps it on an exact tie.
  const survivorRank = CONSENT_STATE_RANK[survivor.state] ?? 0;
  const loserRank = CONSENT_STATE_RANK[loser.state] ?? 0;
  return loserRank > survivorRank
    ? { row: loser, fromLoser: true }
    : { row: survivor, fromLoser: false };
}

async function readConsentCombinations(
  tx: Tx,
  survivorId: string,
  loserId: string,
): Promise<MergeConsentCombination[]> {
  const result = await tx.query<{
    season_id: string;
    season_label: string;
    survivor_state: string;
    survivor_source: string | null;
    survivor_changed_at: Date;
    loser_state: string;
    loser_source: string | null;
    loser_changed_at: Date;
  }>(
    `select s.id as season_id, s.label as season_label,
            a.state::text as survivor_state, a.source::text as survivor_source, a.changed_at as survivor_changed_at,
            b.state::text as loser_state, b.source::text as loser_source, b.changed_at as loser_changed_at
       from public.season_messaging_consents a
       join public.season_messaging_consents b
         on b.season_id = a.season_id and b.person_id = $2::uuid
       join public.seasons s on s.id = a.season_id
      where a.person_id = $1::uuid`,
    [survivorId, loserId],
  );

  return result.rows.map((row) => {
    const { row: winner, fromLoser } = combineConsentRows(
      {
        state: row.survivor_state,
        source: row.survivor_source,
        changed_at: row.survivor_changed_at,
      },
      { state: row.loser_state, source: row.loser_source, changed_at: row.loser_changed_at },
    );
    return {
      seasonId: row.season_id,
      seasonLabel: row.season_label,
      survivorState: row.survivor_state,
      loserState: row.loser_state,
      combinedState: winner.state,
      fromLoser,
    };
  });
}

async function repointConsents(
  tx: Tx,
  survivorId: string,
  loserId: string,
  combinations: readonly MergeConsentCombination[],
): Promise<void> {
  for (const combo of combinations) {
    if (combo.fromLoser) {
      // The loser's row holds the more restrictive (or, on a tie, the newer)
      // decision — move it onto the survivor's own row rather than leaving
      // the survivor's own less-restrictive state standing.
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
    // Whichever side's decision now stands is on the survivor's own row —
    // the loser's, superseded, is removed the same way a colliding prospect
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
async function repointAgreements(tx: Tx, survivorId: string, loserId: string): Promise<void> {
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
async function repointDisputes(tx: Tx, survivorId: string, loserId: string): Promise<void> {
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
async function readWillMove(
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

async function readSideLabelIn(
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
        differs: survivorValue !== loserValue,
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
        differs: (survivor?.rawValue ?? null) !== (loser?.rawValue ?? null),
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
      aliases: {
        survivorAliases: survivorSide.record.aliases.map((a) => a.alias),
        loserAliases: loserSide.record.aliases.map((a) => a.alias),
      },
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

// ---------------------------------------------------------------------------
// The write — every reference this package knows how to re-point
// ---------------------------------------------------------------------------

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
      "keyed (person_id, season_id) like recruitment_prospects — `T07-merge-precedence` " +
      "(WP-operator-record, LAN-217): combined per season before re-pointing, the survivor " +
      "taking the most restrictive of the two states (refused/withdrawn beats any of " +
      "never_asked/asked/granted), never the most recent, so a merge can never manufacture " +
      "permission a person actually declined",
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
}): Promise<MergePersonsResult> {
  const { actorPersonId, survivorPersonId, loserPersonId, fieldChoices } = params;
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
    // `T07-merge-precedence` — `WP-operator-record`, LAN-217. Restrictive
    // wins, never most-recent; see `combineConsentRows`'s own note.
    await repointConsents(tx, survivorPersonId, loserPersonId, consentCombinations);
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
          state: c.combinedState,
        })),
      },
    });

    return { survivorPersonId, loserPersonId };
  });
}
