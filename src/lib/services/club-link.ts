import "server-only";

import crypto from "node:crypto";

import { ConstraintViolated, InvalidTransition, withTransaction, type Tx } from "@/lib/db";

import { UUID_PATTERN } from "./event-input";

// The club link — D2, D81, W7 § "The tiers, and the shareable link" (LAN-157). Bound to one event,
// unlike an RSVP token's one invitation; token = HMAC-SHA256(secret, "club-link:v1:<event>:<row>"),
// only the digest stored. Issuing is authorised by the caller (participation.ts); refused here only
// for a draft event (invariant P1).

// Deliberately narrower than NodeJS.ProcessEnv — this module reads exactly one variable.
export type EnvSource = Readonly<Record<string, string | undefined>>;

export const CLUB_LINK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/; // 32 bytes of HMAC output, base64url

// Domain separation: part of the signed input, so a secret reused for a second link kind can't collide.
const CLUB_LINK_LABEL = "club-link:v1";

const CLUB_LINK_SECRET_SETTING = "CLUB_LINK_SECRET"; // named, never printed

const CLUB_LINK_SECRET_MIN_LENGTH = 32; // not cryptographic — a typo threshold, not a strength one

export const CLUB_LINK_UNCONFIGURED_RULE = "club_link_secret_missing";

// Names the setting and never its value, exactly as the delivery path does for its own.
export const CLUB_LINK_UNCONFIGURED_MESSAGE = `This deployment cannot issue a share link. ${CLUB_LINK_SECRET_SETTING} is not set.`;

export const CLUB_LINK_NEEDS_AN_AUDIENCE_RULE = "club_link_requires_an_approved_event";

export const CLUB_LINK_NEEDS_AN_AUDIENCE_MESSAGE =
  "This event is still a draft. A share link opens once the event is approved.";

// The signing key, or a refusal — deliberately no fallback (see relocations.md).
export function clubLinkSecret(source: EnvSource = process.env): string {
  const value = (source[CLUB_LINK_SECRET_SETTING] ?? "").trim();
  if (value.length < CLUB_LINK_SECRET_MIN_LENGTH) {
    throw new ConstraintViolated(CLUB_LINK_UNCONFIGURED_MESSAGE, {
      rule: CLUB_LINK_UNCONFIGURED_RULE,
    });
  }
  return value;
}

export function clubLinkIsConfigured(source: EnvSource = process.env): boolean {
  try {
    clubLinkSecret(source);
    return true;
  } catch {
    return false;
  }
}

// The plaintext token for one link row — deterministic, never stored; shared with tests that predict a URL.
export function deriveClubLinkToken(
  eventId: string,
  linkId: string,
  source: EnvSource = process.env,
): string {
  return crypto
    .createHmac("sha256", clubLinkSecret(source))
    .update(`${CLUB_LINK_LABEL}:${eventId}:${linkId}`, "utf8")
    .digest("base64url");
}

export function hashClubLinkToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex"); // stored in club_link_tokens.token_hash
}

export function clubLinkUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/e/${encodeURIComponent(token)}`; // origin has no trailing slash
}

export interface IssuedClubLink {
  readonly linkId: string;
  readonly token: string;
  readonly issuedAt: Date;
  readonly reused: boolean; // true when an existing live link was returned rather than minting one
}

// The event's live club link, creating it on first use; idempotent via the partial unique index club_link_tokens_one_live_per_event.
export async function issueClubLinkIn(
  tx: Tx,
  eventId: string,
  options: { actorPersonId?: string | null; env?: EnvSource } = {},
): Promise<IssuedClubLink> {
  const env = options.env ?? process.env;
  clubLinkSecret(env); // ask before touching the database — an unconfigured deployment must not leave an unresolvable row

  // R157-B9: a malformed eventId must not reach Postgres as a raw uuid cast (22P02 is not a ServiceError).
  if (!UUID_PATTERN.test(eventId)) {
    throw new ConstraintViolated("That event no longer exists.", { rule: "event_not_found" });
  }

  const event = await tx.query<{ id: string; status: string }>(
    "select id, status::text as status from public.events where id = $1",
    [eventId],
  );
  const found = event.rows[0];
  if (!found) {
    throw new ConstraintViolated("That event no longer exists.", { rule: "event_not_found" });
  }
  if (found.status === "draft") {
    throw new InvalidTransition(CLUB_LINK_NEEDS_AN_AUDIENCE_MESSAGE, {
      rule: CLUB_LINK_NEEDS_AN_AUDIENCE_RULE,
    });
  }

  const live = await tx.query<{ id: string; issued_at: Date }>(
    `select id, issued_at
       from public.club_link_tokens
      where event_id = $1 and revoked_at is null`,
    [eventId],
  );
  const existing = live.rows[0];
  if (existing) {
    return {
      linkId: existing.id,
      token: deriveClubLinkToken(eventId, existing.id, env),
      issuedAt: existing.issued_at,
      reused: true,
    };
  }

  const linkId = crypto.randomUUID(); // generated here, not by the database, since the digest must be written in the same statement
  const token = deriveClubLinkToken(eventId, linkId, env);

  const inserted = await tx.query<{ id: string; issued_at: Date }>(
    `insert into public.club_link_tokens (id, event_id, token_hash, issued_by_person_id)
     values ($1, $2, $3, $4)
     returning id, issued_at`,
    [linkId, eventId, hashClubLinkToken(token), options.actorPersonId ?? null],
  );

  const created = inserted.rows[0];
  return { linkId: created.id, token, issuedAt: created.issued_at, reused: false };
}

export type ClubLinkResolution =
  | { readonly state: "live"; readonly linkId: string; readonly eventId: string }
  | { readonly state: "unknown" }
  | { readonly state: "revoked" };

// What a presented token opens — a pure read; the use-count stamp happens after this commits, so readers never queue on a row lock (W157-R1; see relocations.md).
export async function resolveClubLinkIn(
  tx: Tx,
  token: string,
  options: { env?: EnvSource } = {},
): Promise<ClubLinkResolution> {
  if (!CLUB_LINK_TOKEN_PATTERN.test(token)) return { state: "unknown" }; // refused before any query runs

  const found = await tx.query<{ id: string; event_id: string; revoked: boolean }>(
    `select id, event_id, revoked_at is not null as revoked
       from public.club_link_tokens
      where token_hash = $1`,
    [hashClubLinkToken(token)],
  );
  const row = found.rows[0];
  if (!row) return { state: "unknown" };
  if (row.revoked) return { state: "revoked" };

  // Re-derives to prove the token was minted for *this* row; timingSafeEqual needs equal lengths first.
  const expected = deriveClubLinkToken(row.event_id, row.id, options.env ?? process.env);
  if (
    expected.length !== token.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token))
  ) {
    return { state: "unknown" };
  }

  return { state: "live", linkId: row.id, eventId: row.event_id };
}

// Stamp one link's Q2 counters. Best effort, unblockable via `skip locked`; use_count is a floor,
// not an exact count, and this never throws (see relocations.md for the incident this shape fixes).
async function recordClubLinkUseIn(tx: Tx, linkId: string): Promise<boolean> {
  const stamped = await tx.query(
    `update public.club_link_tokens as t
        set use_count = t.use_count + 1, last_used_at = now()
       from (
         select id from public.club_link_tokens
          where id = $1
          for update skip locked
       ) as taken
      where t.id = taken.id`,
    [linkId],
  );
  return (stamped.rowCount ?? 0) > 0;
}

// recordClubLinkUseIn in its own transaction, called after the read has committed — one short statement, not a whole participation read.
export async function recordClubLinkUse(linkId: string): Promise<boolean> {
  try {
    return await withTransaction((tx) => recordClubLinkUseIn(tx, linkId));
  } catch {
    return false;
  }
}

// The same stamp, keyed by the presented token — LAN-269. Called from a server action after the
// page renders, not from the read, so WhatsApp's preview crawler is never counted (see relocations.md).
export async function recordClubLinkUseByToken(token: string): Promise<boolean> {
  if (!CLUB_LINK_TOKEN_PATTERN.test(token)) return false;

  try {
    return await withTransaction(async (tx) => {
      const stamped = await tx.query(
        `update public.club_link_tokens as t
            set use_count = t.use_count + 1, last_used_at = now()
           from (
             select id from public.club_link_tokens
              where token_hash = $1
              for update skip locked
           ) as taken
          where t.id = taken.id`,
        [hashClubLinkToken(token)],
      );
      return (stamped.rowCount ?? 0) > 0;
    });
  } catch {
    return false;
  }
}
