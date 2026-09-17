import "server-only";

import { ConstraintViolated, NotFound, withTransaction, type Tx } from "@/lib/db";
import { requireCapability } from "@/lib/auth/guards";
import { ROLE_LABELS } from "@/lib/auth/capabilities";
import { recordAudit } from "../audit";
import { personDisplayAliasSql } from "../sql-text";
import { anonymisePersonIn } from "./anonymise";
import { readErasureEligibilityIn, type ErasureEligibility } from "./eligibility";
import { CORE_FOUR_ROLE_CODES, REQUIRED_SIGNOFF_ROLE_CODES } from "./shared";

/**
 * Two sign-offs, from two people — LAN-361, Brian 2026-09-16.
 *
 * The President and the General Manager each confirm as separate recorded
 * acts. Where one person holds both seats, the second confirmation comes from
 * another of the core four; that is why a sign-off records the seat the signer
 * held rather than checking a fixed pair at the end. Nothing happens until two
 * are in, and the unique key in the migration is what stops the second being
 * the first signer again.
 */

interface ErasureSignOff {
  readonly signedByPersonId: string;
  readonly signedByName: string;
  /** Every qualifying seat this signer held. One person may hold two, and what is still needed depends on which. */
  readonly roleCodes: readonly string[];
  readonly roleLabel: string;
  readonly signedAt: Date;
  readonly requestedOn: string;
}

export interface ErasureState {
  readonly personId: string;
  readonly eligibility: ErasureEligibility;
  /** Who has confirmed already. Zero, or one — two completes the act and clears them. */
  readonly signOffs: readonly ErasureSignOff[];
  /** Which seats would still satisfy the rule, in the words a dialog uses. */
  readonly stillNeeded: readonly string[];
  /** Whether the operator reading this may confirm — capability, and not having confirmed already. */
  readonly viewerMayConfirm: boolean;
}

const ERASURE_SEAT_RULE = "erasure_signer_holds_no_qualifying_seat";
const ERASURE_NOT_ELIGIBLE_RULE = "erasure_person_not_eligible";
const ERASURE_ALREADY_SIGNED_RULE = "erasure_signer_already_confirmed";
const ERASURE_REQUEST_DATE_RULE = "erasure_request_date_required";
const ERASURE_SIGNOFF_PAIR_INCOMPLETE_RULE = "erasure_signoff_pair_incomplete";

/** Every one of the four seats this signer holds. Empty means their confirmation counts for nothing. */
function qualifyingSeats(roleCodes: readonly string[]): readonly string[] {
  return CORE_FOUR_ROLE_CODES.filter((code) => roleCodes.includes(code));
}

/**
 * Which seats would still complete the pair.
 *
 * With nothing recorded, the rule's own two. With one recorded, the other of
 * the two — unless the first signer held both, in which case any of the other
 * core four will do, which is exactly the case Brian named.
 */
function seatsStillNeeded(signed: readonly ErasureSignOff[]): readonly string[] {
  if (signed.length === 0) return REQUIRED_SIGNOFF_ROLE_CODES;
  if (signed.length >= 2) return [];
  const held = signed[0].roleCodes;
  const other = REQUIRED_SIGNOFF_ROLE_CODES.filter((code) => !held.includes(code));
  // One person holding both is exactly the case Brian named: the second
  // confirmation then comes from another of the core four.
  return other.length > 0 ? other : CORE_FOUR_ROLE_CODES.filter((code) => !held.includes(code));
}

/**
 * Whether the seats actually held across both signers satisfy the rule:
 * President and General Manager between them, or one signer holding both.
 * This is `seatsStillNeeded` restated as a pass/fail over the completed pair,
 * so enforcement and the "who is still needed" dialog can never disagree.
 */
function signoffsSatisfyRequiredPair(signed: readonly ErasureSignOff[]): boolean {
  const held = new Set(signed.flatMap((entry) => entry.roleCodes));
  return REQUIRED_SIGNOFF_ROLE_CODES.every((code) => held.has(code));
}

async function readSignOffsIn(tx: Tx, personId: string): Promise<ErasureSignOff[]> {
  const rows = await tx.query<{
    signed_by_person_id: string;
    display_name: string;
    role_codes: string[];
    signed_at: Date;
    requested_on: string;
  }>(
    `select s.signed_by_person_id,
            ${personDisplayAliasSql("p")} as display_name,
            s.role_codes,
            s.signed_at,
            to_char(s.requested_on, 'YYYY-MM-DD') as requested_on
       from public.person_erasure_signoffs s
       join public.people p on p.id = s.signed_by_person_id
      where s.person_id = $1::uuid
      order by s.signed_at`,
    [personId],
  );
  return rows.rows.map((row) => ({
    signedByPersonId: row.signed_by_person_id,
    signedByName: row.display_name,
    roleCodes: row.role_codes,
    roleLabel: row.role_codes.map((code) => ROLE_LABELS[code] ?? code).join(" and "),
    signedAt: row.signed_at,
    requestedOn: row.requested_on,
  }));
}

/** What the person record's own panel renders. Reads only; opening it writes nothing. */
export async function readErasureState(personId: string): Promise<ErasureState> {
  const operator = await requireCapability("person_erasure");
  return withTransaction(async (tx) => {
    const eligibility = await readErasureEligibilityIn(tx, personId);
    const signOffs = await readSignOffsIn(tx, personId);
    return {
      personId,
      eligibility,
      signOffs,
      stillNeeded: seatsStillNeeded(signOffs),
      viewerMayConfirm:
        qualifyingSeats(operator.roleCodes).length > 0 &&
        !signOffs.some((entry) => entry.signedByPersonId === operator.personId),
    };
  });
}

interface ErasureOutcome {
  readonly state: "awaiting-second" | "erased";
}

/**
 * One operator's confirmation. The second one carries the erasure out, in the
 * same transaction, so there is no moment in which a person is half-erased.
 */
export async function confirmErasure(params: {
  personId: string;
  /** The date the person asked, as the operator entered it. The club has one month from it. */
  requestedOn: string;
}): Promise<ErasureOutcome> {
  const operator = await requireCapability("person_erasure");
  const seats = qualifyingSeats(operator.roleCodes);
  if (seats.length === 0) {
    throw new ConstraintViolated(
      "Only the President, Vice-President, Secretary or General Manager may confirm an erasure.",
      { rule: ERASURE_SEAT_RULE },
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.requestedOn)) {
    throw new ConstraintViolated("Record the date the person asked, as a date.", {
      rule: ERASURE_REQUEST_DATE_RULE,
    });
  }

  return withTransaction(async (tx) => {
    const exists = await tx.query<{ id: string }>(
      `select id from public.people where id = $1::uuid for update`,
      [params.personId],
    );
    if (!exists.rows[0]) {
      throw new NotFound("That person is not on record.", { rule: "people_not_found" });
    }

    const eligibility = await readErasureEligibilityIn(tx, params.personId);
    if (!eligibility.eligible) {
      throw new ConstraintViolated(
        eligibility.alreadyErased
          ? "This person has already been anonymised."
          : eligibility.blockers[0].reason,
        { rule: ERASURE_NOT_ELIGIBLE_RULE },
      );
    }

    const before = await readSignOffsIn(tx, params.personId);
    if (before.some((entry) => entry.signedByPersonId === operator.personId)) {
      throw new ConstraintViolated(
        "You have already confirmed this. The second confirmation has to come from somebody else.",
        { rule: ERASURE_ALREADY_SIGNED_RULE },
      );
    }

    await tx.query(
      `insert into public.person_erasure_signoffs
         (person_id, signed_by_person_id, role_codes, requested_on)
       values ($1::uuid, $2::uuid, $3::text[], $4::date)`,
      [params.personId, operator.personId, seats, params.requestedOn],
    );

    const after = await readSignOffsIn(tx, params.personId);
    if (after.length < 2) {
      await recordAudit(tx, {
        actorPersonId: operator.personId,
        action: "person_erasure_confirmed",
        entityTable: "people",
        entityId: params.personId,
        toState: "awaiting-second-confirmation",
        context: {
          issue: "LAN-361",
          seats,
          requested_on: params.requestedOn,
          confirmations: after.length,
        },
      });
      return { state: "awaiting-second" as const };
    }

    if (!signoffsSatisfyRequiredPair(after)) {
      throw new ConstraintViolated(
        "The President and the General Manager must each confirm. If one person holds " +
          "both seats, the second confirmation has to come from another of the core four.",
        { rule: ERASURE_SIGNOFF_PAIR_INCOMPLETE_RULE },
      );
    }

    const counts = await anonymisePersonIn(tx, params.personId);

    // One audit event, naming no personal data: who confirmed, from which
    // seats, when the person asked, and what was deleted against what was
    // anonymised. Person ids, never names — the names are gone.
    await recordAudit(tx, {
      actorPersonId: operator.personId,
      action: "person_erased",
      entityTable: "people",
      entityId: params.personId,
      fromState: "on record",
      toState: "anonymised",
      context: {
        issue: "LAN-361",
        controller: "University of Oxford",
        requested_on: after[0].requestedOn,
        confirmed_by: after.map((entry) => ({
          person_id: entry.signedByPersonId,
          seats: entry.roleCodes,
          at: entry.signedAt.toISOString(),
        })),
        deleted: counts.deleted,
        anonymised: counts.scrubbed,
        tokens_revoked: counts.tokensRevoked,
        queued_messages_cancelled: counts.jobsCancelled,
      },
    });

    // A list of who asked to disappear is itself a list of who asked to
    // disappear. It goes with them; the audit event above is the record.
    await tx.query(`delete from public.person_erasure_signoffs where person_id = $1::uuid`, [
      params.personId,
    ]);

    return { state: "erased" as const };
  });
}

/** Withdraws this operator's own confirmation, before the second one lands. */
export async function withdrawErasureConfirmation(personId: string): Promise<void> {
  const operator = await requireCapability("person_erasure");
  return withTransaction(async (tx) => {
    await tx.query(
      `delete from public.person_erasure_signoffs
        where person_id = $1::uuid and signed_by_person_id = $2::uuid`,
      [personId, operator.personId],
    );
    await recordAudit(tx, {
      actorPersonId: operator.personId,
      action: "person_erasure_confirmation_withdrawn",
      entityTable: "people",
      entityId: personId,
      context: { issue: "LAN-361" },
    });
  });
}
