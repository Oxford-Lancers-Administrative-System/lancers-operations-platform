/**
 * The BAFRA roster form's own vocabulary and shaping — LAN-267.
 *
 * No `server-only`, no database, no framework. It is split out of
 * `./roster-form.ts` for exactly the reason `src/lib/delivery/phone-shape.ts`
 * is split out of `phone.ts`: the reader that assembles the form talks to
 * PostgreSQL and must never run in a browser, while the page that renders it
 * is a client component and has to be able to ask the same questions —
 * "whose row is number 12", "who is missing a number" — from there.
 *
 * `./roster-form.ts` re-exports everything below unchanged, so a server-side
 * caller sees no difference at all.
 */

/** There is one club, and this form is only ever ours. */
export const ROSTER_FORM_TEAM = "Oxford Lancers";

/** The jersey numbers the printed form has a row for, per LAN-267's own description. */
export const ROSTER_FORM_FIRST_NUMBER = 1;
export const ROSTER_FORM_LAST_NUMBER = 94;

export type Kit = "blue" | "white";

/** The four codes the officials' form accepts in its Role column. */
export type SidelineRoleCode = "HC" | "AC" | "TR" | "SL";

export interface RosterFormPlayer {
  readonly membershipId: string;
  readonly personId: string;
  readonly givenName: string;
  readonly familyName: string | null;
  readonly studentNumber: string | null;
  /** The current number for the chosen kit, or `null` when this player has none. */
  readonly jerseyNumber: number | null;
  /** `null` means never asked or never answered — the form's "unanswered". */
  readonly rsvp: "yes" | "no" | null;
}

export interface RosterFormCoachRow {
  readonly personId: string;
  readonly givenName: string;
  readonly familyName: string | null;
  readonly bafaRegistrationNumber: string | null;
  readonly roleLabel: string;
  readonly roleCode: SidelineRoleCode;
}

// ---------------------------------------------------------------------------
// Pure shaping — what the printed page renders
// ---------------------------------------------------------------------------

export interface PrintedPlayerRow {
  readonly jerseyNumber: number;
  /** `null` for a jersey number nobody dressed in — the form's blank rows. */
  readonly name: string | null;
  readonly studentNumber: string | null;
}

/** "Surname, Forename", the form's own order. A person with no surname prints their forename alone. */
export function formNameOf(person: { givenName: string; familyName: string | null }): string {
  return person.familyName ? `${person.familyName}, ${person.givenName}` : person.givenName;
}

/**
 * Ninety-four rows, in jersey order, with the dressed players in theirs and
 * every other row blank.
 *
 * `dressed` is exactly who the operator ticked. A ticked player who has no row
 * to go in — no number in this kit, or a number outside 1–94 — simply does not
 * appear, and the warning line above the form is where they are named, because
 * a player the operator meant to dress and the officials will not see is the
 * thing they need to know before kick-off.
 */
export function printedPlayerRows(
  dressed: readonly RosterFormPlayer[],
): readonly PrintedPlayerRow[] {
  const byNumber = new Map<number, RosterFormPlayer>();
  for (const player of dressed) {
    if (hasAPrintableRow(player)) byNumber.set(player.jerseyNumber!, player);
  }

  const rows: PrintedPlayerRow[] = [];
  for (let n = ROSTER_FORM_FIRST_NUMBER; n <= ROSTER_FORM_LAST_NUMBER; n += 1) {
    const player = byNumber.get(n);
    rows.push({
      jerseyNumber: n,
      name: player ? formNameOf(player) : null,
      studentNumber: player?.studentNumber ?? null,
    });
  }
  return rows;
}

/**
 * Whether this player has a row on the printed form at all.
 *
 * Two ways not to. No number in this kit is the obvious one. The other is a
 * number **outside 1–94**: the club's own roster carries a 99, and the
 * officials' form has no row for it, so a player wearing one would silently
 * vanish from a form the operator believed they were on. That is the failure
 * this predicate exists to make nameable rather than invisible.
 */
export function hasAPrintableRow(player: { jerseyNumber: number | null }): boolean {
  return (
    player.jerseyNumber !== null &&
    player.jerseyNumber >= ROSTER_FORM_FIRST_NUMBER &&
    player.jerseyNumber <= ROSTER_FORM_LAST_NUMBER
  );
}

export interface MissingNumberWarning {
  readonly players: readonly string[];
  readonly coaches: readonly string[];
  readonly notDressable: readonly string[];
}

/**
 * Who is on this form with something missing — LAN-267: "the page shows a
 * warning line above the form naming who is missing what, so the operator can
 * fill it in by hand or chase it before the game."
 *
 * Three separate lists, because they are three different problems with three
 * different remedies: a player whose row will print without a student number,
 * a coach whose row will print without a BAFA number, and a player the
 * operator ticked who has no row on the form at all — no number in this kit,
 * or a number outside the 1–94 the form has rows for. The third is the one
 * that silently loses somebody, so it is named separately rather than folded
 * in with the blanks.
 */
export function missingNumberWarning(
  dressed: readonly RosterFormPlayer[],
  coaches: readonly RosterFormCoachRow[],
): MissingNumberWarning {
  const blank = (value: string | null) => value === null || value.trim() === "";
  return {
    players: dressed.filter((p) => hasAPrintableRow(p) && blank(p.studentNumber)).map(formNameOf),
    coaches: coaches.filter((c) => blank(c.bafaRegistrationNumber)).map(formNameOf),
    notDressable: dressed.filter((p) => !hasAPrintableRow(p)).map(formNameOf),
  };
}
