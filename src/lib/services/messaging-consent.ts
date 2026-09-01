import "server-only";

import { InvalidTransition, withTransaction, type Tx } from "@/lib/db";

/**
 * The season-scoped messaging consent gate — LAN-202, packet amendment 1.
 *
 * `season_messaging_consents` (LAN-201) is the table every send checks: a
 * person carries one row per season, and a message may go out only while that
 * row's `state` is `granted`. This module is the read of that row and the one
 * write shape `WP-signup-gate` needs to reach `granted` or `withdrawn`.
 *
 * ## The seam with `WP-recruitment-messaging` (LAN-202 amendment 3)
 *
 * {@link requireGrantedSeasonMessagingConsentIn} is the check every send calls,
 * defined here and consumed by `WP-recruitment-messaging` (LAN-203), which runs
 * concurrently and owns the actual dispatch loop. Nothing about *how* a message
 * is sent lives in this module — only the one gate a caller must pass before it
 * tries.
 *
 * ## `source`, and why this module only ever writes `qr_self_entry`
 *
 * `season_messaging_consent_source` has three values, and the schema's own
 * comment reads them as "covering all three doors" — but the three doors are
 * three *mechanisms of obtaining consent*, not three routes:
 *
 *   - `qr_self_entry` — the person ticks the box themselves, on the sign-up
 *     form this package builds. Reached from the QR (anonymous) and from a
 *     WhatsApp link (tokenised, prefilled) alike — both are the same surface,
 *     and in both the recruit is the one pressing save.
 *   - `walk_up_read_back` — `W5`'s verbal read-back at a walk-up capture,
 *     recorded by an operator on the strength of what the recruit said aloud.
 *     That is a different package's (`WP-recruitment-messaging`'s sibling,
 *     walk-up capture) own write, never this module's.
 *   - `operator_recorded` — `W6`'s operator-typed consent. Also never this
 *     module's write.
 *
 * A self-service withdrawal (the opt-out link) is the same category as a
 * self-service grant — nobody but the credential holder acted — so it is
 * recorded with the same `qr_self_entry` source. There is no fourth value for
 * "self-service, off the sign-up form", and inventing one is a migration this
 * package does not own; this is the closest-fit existing value, and is called
 * out here rather than left to be rediscovered from the write.
 */

export type SeasonMessagingConsentState =
  "never_asked" | "asked" | "granted" | "refused" | "withdrawn";

export type SeasonMessagingConsentSource =
  "qr_self_entry" | "walk_up_read_back" | "operator_recorded";

/** The one source this module ever writes — see the module note. */
const SELF_SERVICE_SOURCE: SeasonMessagingConsentSource = "qr_self_entry";

export interface SeasonMessagingConsent {
  readonly personId: string;
  readonly seasonId: string;
  readonly state: SeasonMessagingConsentState;
  readonly source: SeasonMessagingConsentSource | null;
  readonly changedAt: string;
}

interface ConsentRow {
  person_id: string;
  season_id: string;
  state: SeasonMessagingConsentState;
  source: SeasonMessagingConsentSource | null;
  changed_at: Date;
}

function toConsent(row: ConsentRow): SeasonMessagingConsent {
  return {
    personId: row.person_id,
    seasonId: row.season_id,
    state: row.state,
    source: row.source,
    changedAt: row.changed_at.toISOString(),
  };
}

/**
 * The current consent row for one person, one season — `null` when nothing
 * has ever been recorded (`never_asked` with no row is what "never asked"
 * looks like; there is no row minted just to say so).
 */
export async function readSeasonMessagingConsentIn(
  tx: Tx,
  personId: string,
  seasonId: string,
): Promise<SeasonMessagingConsent | null> {
  const result = await tx.query<ConsentRow>(
    `select person_id, season_id, state::text as state, source::text as source, changed_at
       from public.season_messaging_consents
      where person_id = $1::uuid and season_id = $2::uuid`,
    [personId, seasonId],
  );
  const row = result.rows[0];
  return row ? toConsent(row as unknown as ConsentRow) : null;
}

/** `true` only when the current, live state is exactly `granted`. */
export async function hasGrantedSeasonMessagingConsentIn(
  tx: Tx,
  personId: string,
  seasonId: string,
): Promise<boolean> {
  const consent = await readSeasonMessagingConsentIn(tx, personId, seasonId);
  return consent?.state === "granted";
}

export const SEASON_MESSAGING_CONSENT_REQUIRED_RULE = "season_messaging_consent_required";

/**
 * The gate every send calls (LAN-202 "Done when": "a send for a season with no
 * granted record is refused in the service layer"). Throws
 * {@link InvalidTransition} with `rule: SEASON_MESSAGING_CONSENT_REQUIRED_RULE`
 * unless this person's current state for this season is exactly `granted` —
 * `never_asked`, `asked`, `refused` and `withdrawn` are all refused alike, and
 * so is a person with no row at all. Never a channel distinction: one gate
 * covers every channel, by construction (packet amendment 1).
 *
 * Writes nothing. A caller wraps its own send in this, inside its own
 * transaction, and never sends if it throws.
 */
export async function requireGrantedSeasonMessagingConsentIn(
  tx: Tx,
  personId: string,
  seasonId: string,
): Promise<void> {
  const granted = await hasGrantedSeasonMessagingConsentIn(tx, personId, seasonId);
  if (!granted) {
    throw new InvalidTransition(
      "This person has not granted messaging consent for this season, so no message may be sent.",
      { rule: SEASON_MESSAGING_CONSENT_REQUIRED_RULE },
    );
  }
}

/** Convenience wrapper for a caller with no open transaction. */
export async function requireGrantedSeasonMessagingConsent(
  personId: string,
  seasonId: string,
): Promise<void> {
  return withTransaction((tx) => requireGrantedSeasonMessagingConsentIn(tx, personId, seasonId));
}

/**
 * Records consent granted by the person's own tick on the sign-up form —
 * `qr_self_entry`, whichever door reached the form. Upserts: re-granting an
 * already-granted or previously withdrawn/refused row for the same
 * (person, season) simply moves it to `granted`, dated now.
 */
export async function grantSeasonMessagingConsentIn(
  tx: Tx,
  personId: string,
  seasonId: string,
): Promise<SeasonMessagingConsent> {
  const result = await tx.query<ConsentRow>(
    `insert into public.season_messaging_consents (person_id, season_id, state, source, changed_at)
     values ($1::uuid, $2::uuid, 'granted', $3::public.messaging_consent_source, now())
     on conflict (person_id, season_id) do update
       set state = 'granted', source = excluded.source, changed_at = now()
     returning person_id, season_id, state::text as state, source::text as source, changed_at`,
    [personId, seasonId, SELF_SERVICE_SOURCE],
  );
  return toConsent(result.rows[0] as unknown as ConsentRow);
}

/**
 * Withdraws consent for one season, from the opt-out link — honoured
 * immediately, and across every channel, because there is exactly one gate
 * (packet amendment 1). Upserts the same way {@link grantSeasonMessagingConsentIn}
 * does: a person with no prior row (an opt-out link reached before any grant
 * — should not happen, but is not trusted not to) still ends up `withdrawn`
 * rather than throwing.
 */
export async function withdrawSeasonMessagingConsentIn(
  tx: Tx,
  personId: string,
  seasonId: string,
): Promise<SeasonMessagingConsent> {
  const result = await tx.query<ConsentRow>(
    `insert into public.season_messaging_consents (person_id, season_id, state, source, changed_at)
     values ($1::uuid, $2::uuid, 'withdrawn', $3::public.messaging_consent_source, now())
     on conflict (person_id, season_id) do update
       set state = 'withdrawn', source = excluded.source, changed_at = now()
     returning person_id, season_id, state::text as state, source::text as source, changed_at`,
    [personId, seasonId, SELF_SERVICE_SOURCE],
  );
  return toConsent(result.rows[0] as unknown as ConsentRow);
}
