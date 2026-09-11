import "server-only";

import { Conflict, ConstraintViolated, NotFound, type Tx } from "@/lib/db";

// Types and helpers shared by the roster module's duplicate-check and write
// siblings.

/** What the operator typed into UX-10. Never mutated, never normalised in place. */
export interface ReturnerIntakeInput {
  givenName: string;
  familyName?: string | null;
  knownAs?: string | null;
  email?: string | null;
  phone?: string | null;
  /** LAN-215: `roster-import.ts`'s addition. Written only for a person this call mints — see `insertPerson`. */
  college?: string | null;
  matriculationYear?: number | null;
}

export type CandidateMatch = "given name" | "family name" | "known as" | "email" | "phone";

export interface PersonCandidate {
  personId: string;
  givenName: string;
  familyName: string | null;
  displayAlias: string | null;
  /** UX-11: current preferred email, else most recent current one; `null` when none current. */
  email: string | null;
  phone: string | null;
  /** Their membership in the open season, when they hold one; `seasonLabel` lets UX-12 render its sentence without a second query. */
  currentMembership: { id: string; status: string; seasonLabel: string } | null;
  matchedOn: CandidateMatch[];
}

export type IntakeDecision =
  { kind: "existing"; personId: string } | { kind: "new"; confirmed: true };

export interface ReturnerIntakeResult {
  personId: string;
  membershipId: string;
  seasonId: string;
  seasonLabel: string;
  personCreated: boolean;
  aliasCreated: boolean;
  contactsRecorded: RecordedContact[];
  /** LAN-257: typed but deliberately not written, so the confirmation can say so. Non-empty only on "Use selected person". */
  contactsNotRecorded: TypedContact[];
  confirmedOn: string;
  /** LAN-215: the welcome queued in the same transaction as the membership. */
  welcomeQueued: boolean;
}

export interface RecordedContact {
  kind: "email" | "phone";
  rawValue: string;
  /** `false` when already preferred; in practice always `true` since LAN-257, kept because the confirmation screen states it. */
  isPreferred: boolean;
}

export interface TypedContact {
  kind: "email" | "phone";
  rawValue: string;
}

export interface OpenSeason {
  id: string;
  label: string;
}

export function trimmedOrNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** The intake input reduced to the values this module acts on. `raw` is stored as typed; `compare` is trimmed, for comparison only. */
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

/** The one season a membership may be created in today (`open` or `active`). Fails closed both ways: none is `NotFound`, more than one is `Conflict`. */
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
