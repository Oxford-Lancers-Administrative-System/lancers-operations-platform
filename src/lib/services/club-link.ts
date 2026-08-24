import "server-only";

import crypto from "node:crypto";

import { ConstraintViolated, InvalidTransition, withTransaction, type Tx } from "@/lib/db";

import { UUID_PATTERN } from "./event-input";

/**
 * The club link — D2, D81, W7 § "The tiers, and the shareable link". LAN-157.
 *
 * ## Why this is not `./rsvp-tokens.ts`
 *
 * The two look alike and are not alike. An RSVP token is bound to **one
 * invitation**, answers "who are you", is single-use in spirit, expires when
 * the event starts, and is deliberately **unrecoverable**: the plaintext exists
 * for as long as it takes to build one URL and is then gone forever, so
 * repairing a delivery means issuing a new one.
 *
 * A club link is bound to **one event**, answers "may you see this event's
 * participation", is held by however many coaches the club shares it with, and
 * has to survive the operator closing the dialog. `club_link_tokens` is a
 * separate table for the same reason, and the migration that created it says
 * so: one table holding both would be a single bug away from an RSVP link
 * reading a squad list.
 *
 * ## The plaintext is derived, not stored — and that is what makes it stable
 *
 * The table stores a SHA-256 digest and nothing else; its check constraint
 * refuses anything that is not one, so there is no column a plaintext token
 * could hide in. An operator who presses **Share link** on Wednesday must
 * nevertheless see the same URL they shared on Monday — a link that changed
 * every time it was looked at would strand every copy already in a WhatsApp
 * thread.
 *
 * So the token is **derived** rather than drawn:
 *
 *     token = base64url( HMAC-SHA256( CLUB_LINK_SECRET, "club-link:v1:<event>:<row>" ) )
 *
 * which is exactly what D81 asks for in the word it uses — the link is
 * **signed** rather than guessable. Nobody without the secret can produce one,
 * the digest is still all the database holds, and the same two identifiers
 * always yield the same 256-bit token.
 *
 * ## Why the row id is in the input
 *
 * Q2 — expiry, rotation and revocation — is a nonblocking unknown Brian chose
 * to settle by testing, and this ships without revocation. Putting the token
 * row's own uuid into the HMAC input keeps every one of those additive:
 *
 *   * **revocation** is `revoked_at`, which `resolveClubLink` already refuses;
 *   * **rotation** is a second row with a different uuid, which derives a
 *     different token, with no schema change and no new column.
 *
 * Deriving from the event id alone would have made rotation impossible without
 * a migration, and this package owns no migration.
 *
 * ## What is refused, and where
 *
 * Authorisation for *issuing* is the caller's — `src/lib/services/participation.ts`
 * takes it, in the service layer. What is refused here is a link for an event
 * that has no participation table to share: a draft has no audience, no
 * invitations and no answers (invariant P1), so there is nothing for a coach to
 * read and no reason for a URL to exist.
 */

/**
 * Where the signing key is read from.
 *
 * Deliberately narrower than `NodeJS.ProcessEnv`: this module reads exactly one
 * variable, and a test that has to construct a whole `ProcessEnv` — `NODE_ENV`
 * and all — to prove a refusal is a test the type system made worse.
 */
export type EnvSource = Readonly<Record<string, string | undefined>>;

/** 32 bytes of HMAC output — 256 bits. base64url encodes it in 43 characters. */
export const CLUB_LINK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Domain separation. The label is part of the signed input so that the same
 * secret, if it is ever reused for a second kind of link, cannot produce a
 * token that is valid for both.
 */
const CLUB_LINK_LABEL = "club-link:v1";

/** The setting that carries the signing key. Named, never printed. */
export const CLUB_LINK_SECRET_SETTING = "CLUB_LINK_SECRET";

/**
 * The floor on the secret's length, in characters.
 *
 * 32 is not a cryptographic threshold — HMAC accepts any key — it is a
 * typo threshold. A one-word value in Secret Manager is a value somebody
 * guessed at, and the difference between "configured" and "configured with
 * something worth signing with" is worth failing on.
 */
export const CLUB_LINK_SECRET_MIN_LENGTH = 32;

export const CLUB_LINK_UNCONFIGURED_RULE = "club_link_secret_missing";

/**
 * What an operator is told when this deployment cannot sign a link.
 *
 * It names the setting and never its value, exactly as the delivery path does
 * for its own. Brian is the operator, and the setting name is the only part of
 * this sentence he can act on.
 */
export const CLUB_LINK_UNCONFIGURED_MESSAGE = `This deployment cannot issue a share link. ${CLUB_LINK_SECRET_SETTING} is not set.`;

export const CLUB_LINK_NEEDS_AN_AUDIENCE_RULE = "club_link_requires_an_approved_event";

export const CLUB_LINK_NEEDS_AN_AUDIENCE_MESSAGE =
  "This event is still a draft. A share link opens once the event is approved.";

/**
 * The signing key, or a refusal.
 *
 * A missing value is a **refusal, not a default**, and there is deliberately no
 * fallback: a derived-from-nothing key would produce links that silently stop
 * working the moment a real one was configured, and a hard-coded one would put
 * a signing key in a public repository.
 */
export function clubLinkSecret(source: EnvSource = process.env): string {
  const value = (source[CLUB_LINK_SECRET_SETTING] ?? "").trim();
  if (value.length < CLUB_LINK_SECRET_MIN_LENGTH) {
    throw new ConstraintViolated(CLUB_LINK_UNCONFIGURED_MESSAGE, {
      rule: CLUB_LINK_UNCONFIGURED_RULE,
    });
  }
  return value;
}

/** Whether this deployment can sign a link at all. For deciding what to render. */
export function clubLinkIsConfigured(source: EnvSource = process.env): boolean {
  try {
    clubLinkSecret(source);
    return true;
  } catch {
    return false;
  }
}

/**
 * The plaintext token for one link row. Deterministic, and never stored.
 *
 * Exported because `issueClubLink` and every test that has to predict a URL
 * need the same function; nothing else should call it.
 */
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

/** The digest stored in `club_link_tokens.token_hash`. Lowercase hex. */
export function hashClubLinkToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

/** Where a club link points. `origin` has no trailing slash. */
export function clubLinkUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/e/${encodeURIComponent(token)}`;
}

export interface IssuedClubLink {
  readonly linkId: string;
  readonly token: string;
  readonly issuedAt: Date;
  /**
   * `true` when the event already had a live link and this call returned it
   * rather than creating one.
   *
   * The operator is not told: from the dialog's point of view there is one
   * link and it is this one. It exists so a test can prove that pressing
   * **Share link** twice does not mint a second token, which is the property
   * the whole derivation exists for.
   */
  readonly reused: boolean;
}

/**
 * The event's live club link, creating it on first use.
 *
 * Idempotent by design rather than by luck: the partial unique index
 * `club_link_tokens_one_live_per_event` makes a second live row impossible, and
 * the read-then-derive path below returns the existing row's token instead of
 * competing with it.
 */
export async function issueClubLinkIn(
  tx: Tx,
  eventId: string,
  options: { actorPersonId?: string | null; env?: EnvSource } = {},
): Promise<IssuedClubLink> {
  const env = options.env ?? process.env;
  // Ask for the secret before touching the database. An unconfigured deployment
  // must not leave a row behind whose token nobody can compute.
  clubLinkSecret(env);

  // R157-B9. A server action is a POST endpoint anybody with a session can
  // call, and `eventId` arrives from a form field. A malformed one used to
  // reach Postgres as a `uuid` cast and raise 22P02, which is not a
  // `ServiceError` — so the operator got a Next.js error page instead of the
  // in-panel refusal `docs/ux/standards.md` rule 6 requires. Refused here, with
  // the rule the absent-event case already uses, so every caller of this
  // function is covered rather than only the one action.
  //
  // `readEventIn` guards its own reads the same way and for the same reason;
  // this is the write path's half of it.
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

  // Generated here rather than by the database, because the token is derived
  // from it and the digest has to be written in the same statement.
  const linkId = crypto.randomUUID();
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

/** `issueClubLinkIn` in its own transaction. */
export async function issueClubLink(
  eventId: string,
  options: { actorPersonId?: string | null; env?: EnvSource } = {},
): Promise<IssuedClubLink> {
  return withTransaction((tx) => issueClubLinkIn(tx, eventId, options));
}

export type ClubLinkResolution =
  | { readonly state: "live"; readonly linkId: string; readonly eventId: string }
  | { readonly state: "unknown" }
  | { readonly state: "revoked" };

/**
 * What a presented token opens, in one statement.
 *
 * One round trip rather than three, for the reason `resolveRsvpToken` gives:
 * reading the token, then the link, then the event would make the timing of a
 * refusal depend on which check failed.
 *
 * `unknown` and `revoked` stay separate facts here and are collapsed into one
 * uniform 404 by the route, exactly as the RSVP surface does — a club link is
 * not privacy-blocking (D81), but which of the two a stranger is holding is
 * still nobody's business.
 *
 * **Use is recorded, and not from here — W157-R1.** `use_count` and
 * `last_used_at` exist for Q2: settling expiry by testing means knowing whether
 * a link is still being opened. This function used to stamp them itself, in the
 * caller's transaction, and that made every reader of one link take a row lock
 * on that link's single row and hold it until the read committed.
 *
 * Concurrent readers of **one** link therefore serialized on one tuple, each
 * holding a pooled connection while it waited. Measured on this branch: 40
 * simultaneous readers of one token produced 29 HTTP 500s, while the same 40
 * spread over four tokens produced none. The pool (`DATABASE_POOL_MAX`, 10)
 * filled with waiters, later requests exceeded `connectionTimeoutMillis`, and
 * Next rendered its own error page rather than this package's unavailable
 * panel — so a squad opening a link the operator had just pasted into WhatsApp
 * read "the club's system is broken" instead of a squad list. That is the exact
 * moment this link exists for, and it is far inside the rate limiter's own
 * per-link allowance, so `R157-B4`'s brake never sees it.
 *
 * So resolution is now a **pure read**, and the stamp is `recordClubLinkUse`
 * below, after the read has committed. The paired check constraint still means
 * both columns move together or neither does.
 */
export async function resolveClubLinkIn(
  tx: Tx,
  token: string,
  options: { env?: EnvSource } = {},
): Promise<ClubLinkResolution> {
  // A token that could not have been minted is refused before a query runs, so
  // an arbitrary string never reaches the index.
  if (!CLUB_LINK_TOKEN_PATTERN.test(token)) return { state: "unknown" };

  const found = await tx.query<{ id: string; event_id: string; revoked: boolean }>(
    `select id, event_id, revoked_at is not null as revoked
       from public.club_link_tokens
      where token_hash = $1`,
    [hashClubLinkToken(token)],
  );
  const row = found.rows[0];
  if (!row) return { state: "unknown" };
  if (row.revoked) return { state: "revoked" };

  // Belt and braces, and cheap: the stored digest proves the token was minted
  // by this deployment, and re-deriving proves it was minted for *this* row.
  // A future change that let two rows share an event would be caught here
  // rather than by a coach reading the wrong squad list.
  const expected = deriveClubLinkToken(row.event_id, row.id, options.env ?? process.env);
  // `timingSafeEqual` throws on unequal lengths, so the length is compared
  // first. Both sides are 43-character base64url by construction, so this can
  // only differ if the derivation itself changed.
  if (
    expected.length !== token.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token))
  ) {
    return { state: "unknown" };
  }

  return { state: "live", linkId: row.id, eventId: row.event_id };
}

/**
 * Stamp one link's Q2 counters. Best effort, and deliberately unblockable.
 *
 * ## Why it never waits
 *
 * `for update skip locked` rather than a plain `update`. A plain one queues
 * behind whoever holds the row, and queuing is the whole defect W157-R1 fixed:
 * a request that waits on this tuple is a request holding a pooled connection
 * while it waits, and enough of those exhaust the pool and turn a busy link
 * into an HTTP 500. Taking the stamp out of the read transaction removes the
 * long hold; skipping the lock removes the short one too, so there is no path
 * left where a reader of `/e/<token>` blocks on this row.
 *
 * ## What that costs, stated plainly
 *
 * **A stamp can be lost.** When two requests for the same link try to stamp in
 * the same instant, the second finds the row locked, skips, and that view is
 * never counted. The window is one short transaction — the `update` and its
 * `commit`, sub-millisecond — rather than the whole participation read, which
 * is why this shape loses far less than skipping inside the read would. But
 * `use_count` is now a **floor on** views rather than a count of them, and it
 * undercounts exactly when a link is busiest.
 *
 * Q2 — whether club links need expiry — will be settled from this number, so
 * the number's meaning matters more than its precision: "was this link opened,
 * and recently" survives undercounting, and that is the question Q2 asks.
 * A count that has to be exact needs an append-only row per view, which is a
 * migration, and this package owns none.
 *
 * ## Failure is silence
 *
 * A reader must never be shown an error because a telemetry counter did not
 * move. The caller is expected to swallow what this throws; `use_count` going
 * stale is a reporting problem, and a coach staring at an error panel instead
 * of a squad list is an operational one.
 */
export async function recordClubLinkUseIn(tx: Tx, linkId: string): Promise<boolean> {
  // Postgres has no `skip locked` on `update` itself, so the row is taken in a
  // sub-select that has one and the update is driven from what it returns. A
  // locked row makes the sub-select empty, the update touch nothing, and the
  // statement return at once instead of waiting.
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

/**
 * `recordClubLinkUseIn` in its own transaction, and never a reason to fail.
 *
 * Called **after** the read transaction has committed, so the connection this
 * takes is held for one short statement rather than for a participation read.
 *
 * Returns whether the stamp landed. `false` covers both "another request held
 * the row" and "the write failed" — neither is something a reader is told, and
 * the distinction belongs to whoever later asks why `use_count` is a floor.
 */
export async function recordClubLinkUse(linkId: string): Promise<boolean> {
  try {
    return await withTransaction((tx) => recordClubLinkUseIn(tx, linkId));
  } catch {
    return false;
  }
}
