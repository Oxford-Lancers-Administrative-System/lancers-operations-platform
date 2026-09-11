import "server-only";

import { InvalidTransition, withTransaction, type Tx } from "@/lib/db";

// The season-scoped messaging consent gate — LAN-202, packet amendment 1. One row per
// (person, season); a message may go out only while state is 'granted'. Only ever writes source
// 'qr_self_entry' (see relocations.md).
// Decision history: missions/intake/M-RECRUITMENT

export type SeasonMessagingConsentState =
  "never_asked" | "asked" | "granted" | "refused" | "withdrawn";

export type SeasonMessagingConsentSource =
  "qr_self_entry" | "walk_up_read_back" | "operator_recorded";

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

// null when nothing has ever been recorded.
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

export async function hasGrantedSeasonMessagingConsentIn(
  tx: Tx,
  personId: string,
  seasonId: string,
): Promise<boolean> {
  const consent = await readSeasonMessagingConsentIn(tx, personId, seasonId);
  return consent?.state === "granted";
}

export const SEASON_MESSAGING_CONSENT_REQUIRED_RULE = "season_messaging_consent_required";

// The gate every send calls (LAN-202). Refuses unless state is exactly 'granted'. Writes nothing.
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

export async function requireGrantedSeasonMessagingConsent(
  personId: string,
  seasonId: string,
): Promise<void> {
  return withTransaction((tx) => requireGrantedSeasonMessagingConsentIn(tx, personId, seasonId));
}

// The one, narrow exception — LAN-204's consent deadlock (see relocations.md).
export async function mayReceiveWelcomeContactIn(
  tx: Tx,
  personId: string,
  seasonId: string,
): Promise<boolean> {
  const consent = await readSeasonMessagingConsentIn(tx, personId, seasonId);
  const state = consent?.state ?? "never_asked";
  return state !== "refused" && state !== "withdrawn";
}

// Q-read-back-authorises-how-much: a walk_up_read_back grant authorises only the welcome track (see relocations.md).
export async function hasGrantedViaSignupFormIn(
  tx: Tx,
  personId: string,
  seasonId: string,
): Promise<boolean> {
  const consent = await readSeasonMessagingConsentIn(tx, personId, seasonId);
  return consent?.state === "granted" && consent.source === SELF_SERVICE_SOURCE;
}

// Upserts: re-granting moves an existing row to granted, dated now.
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

// Honoured immediately, every channel. Upserts, so a person with no prior row still ends up withdrawn.
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
