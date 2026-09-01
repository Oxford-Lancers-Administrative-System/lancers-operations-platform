import "server-only";

import { InvalidTransition, withTransaction, type Tx } from "@/lib/db";

/**
 * The season-scoped consent gate every send checks. LAN-203, Amendment 4.
 *
 * ## This file is a stub, not this package's design
 *
 * LAN-202 (`WP-signup-gate`) defines this check — it owns the write path that
 * grants, refuses and withdraws consent, and Amendment 3 of its own issue
 * names this exact module path and these four exports as the contract every
 * concurrent send site is to compile against. It ran concurrently with this
 * package and had not merged when this file was needed, so — per Amendment
 * 4, "build against the seam; if it has not landed, define the narrowest
 * call site you need" — this is that narrowest call site: the four names
 * below, their exact signatures, and their exact refusal behaviour, with
 * nothing this package invented layered on top.
 *
 * **On rebase, this file is replaced wholesale by `main`'s real module.**
 * Every call site in this package imports only the four names below, so that
 * replacement changes no other line (per the Mission Lead's reconciliation
 * plan, 2026-09-01).
 */

export const SEASON_MESSAGING_CONSENT_REQUIRED_RULE = "season_messaging_consent_required";

/** The five-value ladder `season_messaging_consents.state` already carries (LAN-201). */
export type SeasonMessagingConsentState =
  "never_asked" | "asked" | "granted" | "refused" | "withdrawn";

export interface SeasonMessagingConsent {
  readonly personId: string;
  readonly seasonId: string;
  readonly state: SeasonMessagingConsentState;
  readonly changedAt: Date;
}

/** The current consent record for one person, one season — or `null` if none exists yet. */
export async function readSeasonMessagingConsentIn(
  tx: Tx,
  personId: string,
  seasonId: string,
): Promise<SeasonMessagingConsent | null> {
  const result = await tx.query<{ state: string; changed_at: Date }>(
    `select state::text as state, changed_at
       from public.season_messaging_consents
      where person_id = $1 and season_id = $2`,
    [personId, seasonId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    personId,
    seasonId,
    state: row.state as SeasonMessagingConsentState,
    changedAt: row.changed_at,
  };
}

/** Whether a send is currently permitted — `true` for exactly `state = 'granted'`. */
export async function hasGrantedSeasonMessagingConsentIn(
  tx: Tx,
  personId: string,
  seasonId: string,
): Promise<boolean> {
  const consent = await readSeasonMessagingConsentIn(tx, personId, seasonId);
  return consent?.state === "granted";
}

/**
 * The primary. Refuses whenever this person's current state for this season
 * is anything other than exactly `granted` — `never_asked`, `asked`,
 * `refused`, `withdrawn` and no row at all are refused alike. Resolves
 * silently when a send may proceed.
 */
export async function requireGrantedSeasonMessagingConsentIn(
  tx: Tx,
  personId: string,
  seasonId: string,
): Promise<void> {
  const granted = await hasGrantedSeasonMessagingConsentIn(tx, personId, seasonId);
  if (!granted) {
    throw new InvalidTransition(
      "No granted consent record exists for this person this season, so nothing was sent.",
      { rule: SEASON_MESSAGING_CONSENT_REQUIRED_RULE },
    );
  }
}

/** Same refusal behaviour, for a caller with no open transaction. */
export async function requireGrantedSeasonMessagingConsent(
  personId: string,
  seasonId: string,
): Promise<void> {
  return withTransaction((tx) => requireGrantedSeasonMessagingConsentIn(tx, personId, seasonId));
}
