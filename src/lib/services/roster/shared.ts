import "server-only";

import { Conflict, ConstraintViolated, NotFound, type Tx } from "@/lib/db";

// Types and helpers shared by the roster module's duplicate-check and write
// siblings. Decision history: docs/ux/tickets/LAN-74-returner-intake.md.

/** What the operator typed into UX-10. Never mutated, never normalised in place. */
export interface ReturnerIntakeInput {
  givenName: string;
  familyName?: string | null;
  knownAs?: string | null;
  /** Stored verbatim if supplied. Shape-checked only to help the operator. */
  email?: string | null;
  /** Stored verbatim if supplied. Never normalised to E.164 — out of scope. */
  phone?: string | null;
  /**
   * LAN-215, `roster-import.ts`'s own addition to this shared write: the two
   * optional columns the CSV import carries beyond what UX-10's form ever
   * asked for. Written **only** for a person this call mints — see
   * `insertPerson`. UX-10 never supplies either, so this changes nothing
   * about the shipped returner-intake path.
   */
  college?: string | null;
  matriculationYear?: number | null;
}

/** Why a candidate surfaced. Shown to the operator so the choice is informed. */
export type CandidateMatch = "given name" | "family name" | "known as" | "email" | "phone";

/** One possible existing Person, for UX-11. */
export interface PersonCandidate {
  personId: string;
  givenName: string;
  familyName: string | null;
  /** The alias flagged as this person's display name, if they have one. */
  displayAlias: string | null;
  /**
   * An email to show on UX-11: of the person's **current** emails (those with
   * no `valid_until`), the preferred one if there is one, else the most
   * recently recorded. `null` when they have no current email at all — a
   * superseded college address does not appear here.
   *
   * Not strictly "the preferred one": a person can hold a current email that
   * nothing ever marked preferred — an earlier intake left one, or the
   * missing-data queue has not classified it yet — and a candidate list
   * showing those as "—" would drop the field the operator's decision most
   * depends on.
   */
  email: string | null;
  /** A current phone, on exactly the same rule as `email`. */
  phone: string | null;
  /**
   * Their membership in the open season, when they already hold one.
   *
   * `seasonLabel` is carried so that UX-12 can render its approved sentence —
   * "<name> is already a member for the <season> season" — without a second
   * query, and without the interface inventing a season name of its own.
   */
  currentMembership: { id: string; status: string; seasonLabel: string } | null;
  /** Every field that matched, in a stable order. Never empty. */
  matchedOn: CandidateMatch[];
}

/** The operator's explicit answer to "who is this?". There is no third option. */
export type IntakeDecision =
  { kind: "existing"; personId: string } | { kind: "new"; confirmed: true };

/** What was actually written, for UX-13. */
export interface ReturnerIntakeResult {
  personId: string;
  membershipId: string;
  seasonId: string;
  seasonLabel: string;
  /** True when this submission minted the `people` row. */
  personCreated: boolean;
  /** A display alias was written because the known-as differs from the given name. */
  aliasCreated: boolean;
  /** The contact points this submission wrote, in the order written. */
  contactsRecorded: RecordedContact[];
  /**
   * LAN-257 — what the operator typed that this submission deliberately did
   * not write, so the confirmation can say so. Only ever non-empty on the
   * "Use selected person" path: a value the chosen person does not already
   * hold is discarded rather than appended to their record. Empty when they
   * already hold it, because then nothing was discarded either.
   */
  contactsNotRecorded: TypedContact[];
  confirmedOn: string;
  /**
   * LAN-215, W2's own addition: the welcome queued in the same transaction as
   * the membership. `false` only for the "already queued" idempotent replay
   * this function's own transaction never actually produces (a membership is
   * always freshly created here) — carried as a result field rather than
   * assumed, so a caller reads what happened instead of re-deriving it.
   */
  welcomeQueued: boolean;
}

export interface RecordedContact {
  kind: "email" | "phone";
  /** Exactly as the operator typed it. */
  rawValue: string;
  /**
   * `false` when the person already had a preferred contact of this kind.
   * Since LAN-257 only a person this submission minted is written to at all,
   * so in practice this is always `true` — the flag is kept because it is
   * what the confirmation screen states, and a screen that derives "preferred"
   * from an assumption rather than from the write is how the old behaviour
   * went unnoticed.
   */
  isPreferred: boolean;
}

/** A value the operator typed, named by its kind — LAN-257's "this was not written". */
export interface TypedContact {
  kind: "email" | "phone";
  /** Exactly as the operator typed it. */
  rawValue: string;
}

/** The open season every membership in this slice is created in. */
export interface OpenSeason {
  id: string;
  label: string;
}

export function trimmedOrNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * The intake input reduced to the values this module is willing to act on.
 *
 * Names are trimmed because they are identity and the database refuses a blank
 * one. `email` and `phone` keep their original string — `raw` is what gets
 * stored — alongside a trimmed copy used only for comparison and shape checks.
 */
export interface NormalisedInput {
  givenName: string;
  familyName: string | null;
  knownAs: string | null;
  email: { raw: string; compare: string } | null;
  phone: { raw: string; compare: string } | null;
  college: string | null;
  matriculationYear: number | null;
}

export function normaliseInput(input: ReturnerIntakeInput): NormalisedInput {
  const givenName = trimmedOrNull(input.givenName);
  if (!givenName) {
    throw new ConstraintViolated(
      "A first name is required — it is the one name the club always has.",
      {
        rule: "people_given_name_not_blank",
      },
    );
  }

  const email = typeof input.email === "string" && input.email.trim() !== "" ? input.email : null;
  const phone = typeof input.phone === "string" && input.phone.trim() !== "" ? input.phone : null;

  return {
    givenName,
    familyName: trimmedOrNull(input.familyName),
    knownAs: trimmedOrNull(input.knownAs),
    email: email === null ? null : { raw: email, compare: email.trim() },
    phone: phone === null ? null : { raw: phone, compare: phone.trim() },
    college: trimmedOrNull(input.college ?? null),
    matriculationYear: input.matriculationYear ?? null,
  };
}

/**
 * The one season a membership may be created in today.
 *
 * The frozen model calls this "the currently open or active season", and both
 * `open` and `active` are legal here: `open` is a season taking registrations,
 * `active` is one under way, and a returner can be entered in either.
 *
 * It fails closed in both directions. No open season is a `NotFound` telling
 * the operator the season has not been opened yet — not an invitation to pick
 * one. **More than one** is a `Conflict`, because nothing in the schema forbids
 * two seasons being open at once and quietly choosing the newer of them would
 * put a player on the wrong roster with no evidence of the choice.
 */
export async function resolveOpenSeason(tx: Tx): Promise<OpenSeason> {
  const result = await tx.query<{ id: string; label: string }>(
    `select id, label
       from public.seasons
      where status in ('open', 'active')
      order by label`,
  );

  if (result.rows.length === 0) {
    throw new NotFound(
      "There is no open season, so a membership cannot be created yet. " +
        "The President or Secretary opens the season first.",
      { rule: "no_open_season" },
    );
  }

  if (result.rows.length > 1) {
    throw new Conflict(
      "More than one season is currently open, so it is not clear which one this " +
        "membership belongs to. Close or archive the season that has finished, then try again.",
      { rule: "ambiguous_open_season" },
    );
  }

  return result.rows[0];
}
