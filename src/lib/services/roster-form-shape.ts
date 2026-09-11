/** The BAFRA roster form's vocabulary and shaping — LAN-267. No `server-only`: the client component that renders the form imports it directly. */

export const ROSTER_FORM_TEAM = "Oxford Lancers";

export const ROSTER_FORM_FIRST_NUMBER = 1;
export const ROSTER_FORM_LAST_NUMBER = 94;

export type Kit = "blue" | "white";

export type SidelineRoleCode = "HC" | "AC" | "TR" | "SL";

export interface RosterFormPlayer {
  readonly membershipId: string;
  readonly personId: string;
  readonly givenName: string;
  readonly familyName: string | null;
  readonly studentNumber: string | null;
  readonly jerseyNumber: number | null;
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

export interface PrintedPlayerRow {
  readonly jerseyNumber: number;
  readonly name: string | null;
  readonly studentNumber: string | null;
}

export function formNameOf(person: { givenName: string; familyName: string | null }): string {
  return person.familyName ? `${person.familyName}, ${person.givenName}` : person.givenName;
}

/** Ninety-four rows in jersey order, dressed players in theirs, every other row blank. A ticked player with no row is named in the warning line instead. */
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

/** Whether this player has a row on the printed form: a number in this kit, and within 1-94 (the roster can carry a 99). */
function hasAPrintableRow(player: { jerseyNumber: number | null }): boolean {
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

/** Who is on this form with something missing (LAN-267) — three lists: missing student number, missing BAFA number, and no row at all. */
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
