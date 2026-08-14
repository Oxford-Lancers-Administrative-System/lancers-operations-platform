import "server-only";

import crypto from "node:crypto";

import { ConstraintViolated, InvalidTransition, withTransaction, type Tx } from "@/lib/db";

/**
 * RSVP access tokens. LAN-78, implementing Brian's decided token behaviour
 * without reinterpreting any of it.
 *
 * ## The plaintext token's whole life
 *
 * It is generated in `mintToken()`, returned from `issueTokenIn()`, put into
 * one URL by the delivery path, handed to the provider, and dropped. It is
 * never written to a column, never put in an audit row, never logged, never
 * returned from a Server Action and never rendered. The database stores its
 * SHA-256 digest, and the migration's shape check makes storing anything else
 * impossible.
 *
 * The consequence — and it is the design, not a limitation — is that **nobody
 * can recover an issued link, ever**. There is no "show me the link" control
 * for an operator, no support path that reads one out, and no way to resend the
 * same link. Repairing a delivery therefore means issuing a *new* token and
 * superseding the old one, which is exactly what Brian decided reissue means.
 *
 * ## Why resolution is one statement
 *
 * `resolveRsvpToken` answers "may this person write, and to what?" in a single
 * round trip that joins the token to its invitation and its event. Reading the
 * token, then the invitation, then the event would leave three windows in which
 * an event could be cancelled between checks, and would make the timing of a
 * refusal depend on which check failed — which is a side channel, given that
 * LAN-90 requires unknown, expired and revoked tokens to be publicly
 * indistinguishable.
 *
 * ## What the states mean
 *
 * `unknown`, `expired`, `revoked`, `superseded` and `event_started` are
 * separate here because they are separate facts, and because
 * `docs/ux/slice-ux.md` § 9 says they must remain distinct "for secure internal
 * logs, tests and operational diagnostics". LAN-79 owns collapsing them into
 * one uniform public response; this module must not pre-collapse them, or that
 * ticket would have nothing left to distinguish.
 */

/** 32 bytes — 256 bits, the decided floor. base64url encodes it in 43 characters. */
export const TOKEN_BYTES = 32;

/** What a minted token looks like. Used by tests, and by nothing else. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * A fresh token. Cryptographically secure, URL-safe, and carrying no
 * identifier of any kind — not the person, not the event, not the invitation,
 * and no structure at all from which one could be inferred.
 */
export function mintToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

/** The digest stored in `rsvp_access_tokens.token_hash`. Lowercase hex. */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * A newly issued token: its row, and the plaintext.
 *
 * The plaintext is present on this object for as long as it takes to build one
 * URL. It must not be stored, returned to a browser, put in a Server Action's
 * state, or written to an audit row.
 */
export interface IssuedToken {
  readonly tokenId: string;
  readonly token: string;
  readonly expiresAt: Date;
}

export const TOKEN_REQUIRES_A_LIVE_EVENT_RULE = "rsvp_token_requires_a_live_event";
export const TOKEN_REQUIRES_AN_INVITATION_RULE = "rsvp_token_requires_an_invitation";

/**
 * The event's start instant, in SQL rather than in JavaScript.
 *
 * The same reasoning as `response-deadline.ts`: "the event starts at 19:00 on
 * this date, in Oxford" is a wall-clock fact, Britain changes offset twice
 * inside a season, and PostgreSQL carries the IANA database. An event with no
 * recorded start time starts at midnight, which is the earliest it could.
 */
const EVENT_START_EXPRESSION = `
  (e.scheduled_on + coalesce(e.starts_at, '00:00'::time)) at time zone 'Europe/London'`;

/**
 * Issues one token for one invitation, superseding whatever it had.
 *
 * Supersession happens in the same statement sequence as the insert, inside the
 * caller's transaction, so there is no instant at which an invitation has two
 * live tokens — and the partial unique index would refuse it if there were.
 *
 * **Creates nothing but a token.** It takes an invitation that already exists
 * and never inserts one, which is what makes "retry and reissue can only ever
 * target an existing invitation" true by construction rather than by an
 * assertion somewhere in a route handler.
 */
export async function issueTokenIn(
  tx: Tx,
  invitationId: string,
  options: { actorPersonId?: string | null; actorLabel?: string | null } = {},
): Promise<IssuedToken> {
  const context = await tx.query<{
    invitation_id: string;
    event_status: string;
    starts_at: Date;
    already_started: boolean;
  }>(
    `select i.id as invitation_id,
            e.status::text as event_status,
            ${EVENT_START_EXPRESSION} as starts_at,
            ${EVENT_START_EXPRESSION} <= now() as already_started
       from public.invitations i
       join public.events e on e.id = i.event_id
      where i.id = $1`,
    [invitationId],
  );

  const row = context.rows[0];
  if (!row) {
    throw new ConstraintViolated(
      "That invitation no longer exists, so no RSVP link could be issued for it.",
      { rule: TOKEN_REQUIRES_AN_INVITATION_RULE },
    );
  }

  // A link for an event that has already started is dead on arrival: the player
  // could not write through it, and the database's `expires_after_issue` check
  // would refuse the row anyway. Refusing here says which fact is the problem.
  if (row.already_started) {
    throw new InvalidTransition(
      "This event has already started, so a new RSVP link cannot be issued for it.",
      { rule: TOKEN_REQUIRES_A_LIVE_EVENT_RULE },
    );
  }
  if (row.event_status === "cancelled") {
    throw new InvalidTransition(
      "This event has been cancelled, so a new RSVP link cannot be issued for it.",
      { rule: TOKEN_REQUIRES_A_LIVE_EVENT_RULE },
    );
  }

  const token = mintToken();

  // The successor's identifier is generated here rather than by the database,
  // and the reason is the order of the next two statements.
  //
  // `rsvp_access_tokens_one_live_per_invitation` is a plain partial unique
  // index, checked per statement and not deferred. Inserting the successor
  // first therefore fails outright while the predecessor is still live — there
  // is no instant in which two live tokens are tolerated, which is exactly what
  // the index is for and exactly what makes the obvious order wrong.
  //
  // So the predecessor is superseded first, pointing at an identifier that does
  // not exist yet. That is safe because `superseded_by_token_id` is checked
  // only at commit — it is a foreign key, and the insert below satisfies it
  // inside the same transaction — while `supersession_is_paired` is satisfied
  // immediately, both columns being written together.
  const tokenId = crypto.randomUUID();

  await tx.query(
    `update public.rsvp_access_tokens
        set superseded_at = now(), superseded_by_token_id = $2
      where invitation_id = $1
        and id <> $2
        and revoked_at is null
        and superseded_at is null`,
    [invitationId, tokenId],
  );

  const inserted = await tx.query<{ id: string; expires_at: Date }>(
    `insert into public.rsvp_access_tokens
       (id, invitation_id, token_hash, expires_at, issued_by_person_id)
     values ($1, $2, $3, $4, $5)
     returning id, expires_at`,
    [tokenId, invitationId, hashToken(token), row.starts_at, options.actorPersonId ?? null],
  );

  const created = inserted.rows[0];
  return { tokenId: created.id, token, expiresAt: created.expires_at };
}

export const REVOCATION_NEEDS_A_REASON_RULE = "rsvp_token_revocation_needs_a_reason";

/**
 * Withdraws every live token for an invitation. Immediate, by definition:
 * resolution reads `revoked_at`, so the next request through that link fails.
 *
 * Returns how many were withdrawn — zero is a legitimate answer, for an
 * invitation whose delivery never got as far as issuing one.
 */
export async function revokeTokensIn(
  tx: Tx,
  invitationId: string,
  reason: string,
): Promise<number> {
  if (reason.trim() === "") {
    throw new ConstraintViolated(
      "Withdrawing an RSVP link has to say why, so the decision can be reviewed later.",
      { rule: REVOCATION_NEEDS_A_REASON_RULE },
    );
  }

  const result = await tx.query(
    `update public.rsvp_access_tokens
        set revoked_at = now(), revoked_reason = $2
      where invitation_id = $1
        and revoked_at is null
        and superseded_at is null`,
    [invitationId, reason.trim()],
  );

  return result.rowCount ?? 0;
}

/** Every reason a link may not be used, kept distinct for logs and tests. */
export type TokenState =
  "valid" | "unknown" | "expired" | "revoked" | "superseded" | "event_started" | "cancelled";

export interface TokenResolution {
  readonly state: TokenState;
  /** Present only for `valid` and `cancelled` — the two states that resolve. */
  readonly invitation: ResolvedInvitation | null;
  /** Whether a player may write a response through this link, right now. */
  readonly writable: boolean;
}

export interface ResolvedInvitation {
  readonly invitationId: string;
  readonly eventId: string;
  readonly eventName: string;
  readonly eventStatus: string;
  readonly startsAt: Date;
  readonly inviteeName: string;
  readonly solicitsResponse: boolean;
  readonly expiresAt: Date | null;
}

/**
 * Resolves a token to what the holder may see and do.
 *
 * Counts the access as a side effect for a token that resolves at all, which is
 * Brian's "repeat access is allowed and shows the current response; update
 * last-used time and use count". A token that does not resolve counts nothing —
 * incrementing on a miss would turn the table into a record of guessing, and
 * there is nothing to increment for a hash that matches no row.
 */
export async function resolveRsvpToken(token: string): Promise<TokenResolution> {
  return withTransaction(async (tx) => resolveRsvpTokenIn(tx, token));
}

export async function resolveRsvpTokenIn(tx: Tx, token: string): Promise<TokenResolution> {
  // An empty or malformed token cannot match a digest, and hashing it would be
  // a pointless round trip. Refused without touching the database.
  if (!TOKEN_PATTERN.test(token)) {
    return { state: "unknown", invitation: null, writable: false };
  }

  const result = await tx.query<{
    token_id: string;
    revoked: boolean;
    superseded: boolean;
    expired: boolean;
    already_started: boolean;
    invitation_id: string;
    event_id: string;
    event_name: string;
    event_status: string;
    starts_at: Date;
    expires_at: Date;
    solicits_response: boolean;
    given_name: string;
    known_as: string | null;
  }>(
    `select t.id as token_id,
            t.revoked_at is not null as revoked,
            t.superseded_at is not null as superseded,
            t.expires_at <= now() as expired,
            ${EVENT_START_EXPRESSION} <= now() as already_started,
            t.expires_at,
            i.id as invitation_id,
            i.solicits_response,
            e.id as event_id, e.name as event_name, e.status::text as event_status,
            ${EVENT_START_EXPRESSION} as starts_at,
            p.given_name, p.known_as
       from public.rsvp_access_tokens t
       join public.invitations i on i.id = t.invitation_id
       join public.events e on e.id = i.event_id
       left join public.season_memberships m on m.id = i.season_membership_id
       join public.people p on p.id = coalesce(i.person_id, m.person_id)
      where t.token_hash = $1`,
    [hashToken(token)],
  );

  const row = result.rows[0];
  if (!row) return { state: "unknown", invitation: null, writable: false };

  const known = row.known_as?.trim();
  const invitation: ResolvedInvitation = {
    invitationId: row.invitation_id,
    eventId: row.event_id,
    eventName: row.event_name,
    eventStatus: row.event_status,
    startsAt: row.starts_at,
    inviteeName: known && known !== "" ? known : row.given_name,
    solicitsResponse: row.solicits_response,
    expiresAt: row.expires_at,
  };

  // Order matters, and this is the order. Revocation is a deliberate act and
  // outranks everything; supersession likewise. Only then does time get a say —
  // so a revoked link never reports itself as merely expired, which would tell
  // a holder that waiting was the problem.
  if (row.revoked) return { state: "revoked", invitation: null, writable: false };
  if (row.superseded) return { state: "superseded", invitation: null, writable: false };
  if (row.expired) return { state: "expired", invitation: null, writable: false };
  if (row.already_started) return { state: "event_started", invitation, writable: false };

  // A valid link to a cancelled event is the one non-uniform public state
  // LAN-90 preserves: the invitation resolved, so the holder may be told the
  // event is off. It is still not writable — there is nothing to answer.
  if (row.event_status === "cancelled") {
    return { state: "cancelled", invitation, writable: false };
  }

  await tx.query(
    `update public.rsvp_access_tokens
        set use_count = use_count + 1, last_used_at = now()
      where id = $1`,
    [row.token_id],
  );

  return { state: "valid", invitation, writable: true };
}
