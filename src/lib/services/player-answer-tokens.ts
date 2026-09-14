import "server-only";

import { ConstraintViolated, InvalidTransition, withTransaction, type Tx } from "@/lib/db";

import { recordAnswerIn } from "./rsvp";
import { hashToken, mintToken, TOKEN_PATTERN } from "./rsvp-tokens";

/**
 * The two credentials LAN-172 reaches `person_access_tokens` with. LAN-169
 * shipped the table with zero consuming code; this module is the first and
 * only consumer, and it defines both shapes the table's comment names.
 *
 * ## One-time answer tokens: the shape, and why it carries no invitation column
 *
 * `person_access_tokens` has `person_id` and `season_id` and nothing that names
 * an invitation or an answer, because it is one table for two different
 * credentials (see the migration's own comment). A one-time answer token still
 * has to identify **which invitation and which button** — Q-11's exact words —
 * without a schema change, so that identity is carried in the plaintext token
 * itself rather than in a column:
 *
 *   `<y|n>.<invitationId>.<43-character random nonce>`
 *
 * The digest stored in `token_hash` is `sha256` of the *whole string*, so the
 * invitation id and the answer are load-bearing input to the hash, not
 * decoration next to it. Changing either one before presenting the token
 * changes the hash, and a changed hash matches no row — so tampering with
 * either field is indistinguishable from presenting a token nobody issued.
 * Guessing is defeated the same way `rsvp_access_tokens` defeats it: the
 * 256-bit nonce is what makes the digest unguessable, and the invitation id
 * riding alongside it in the same hashed string is what lets one digest lookup
 * answer "for which invitation, and which button" without a second column.
 *
 * ## Durable person tokens: issued afresh, never recovered, and never superseded
 *
 * A durable credential cannot have its plaintext read back once minted — same
 * rule `rsvp_access_tokens` already lives by, and the same reason: only the
 * digest is ever stored. So a person's durable link cannot be "looked up
 * again" to put in a second message; every touchpoint that needs to send
 * somebody a link mints a new one at that moment.
 *
 * LAN-343 changed what that does to the link already in their pocket. Until
 * then every mint revoked whatever was live, because
 * `person_access_tokens_one_live_per_person_season` allowed exactly one — so a
 * September link was dead by October and the onboarding page's own promise
 * ("You can leave and come back to this link") was false. Brian, 2026-09-11:
 * a link that was sent keeps resolving until `seasons.closed_at` is set, and a
 * leaked link therefore stays live for the season. Several live durable
 * credentials per person and season now coexist, the index is gone, and
 * `issuePersonTokenIn` inserts without revoking anything.
 *
 * ## One credential per journey
 *
 * `purpose` (LAN-206, extended by LAN-343) is what stops one credential
 * opening four unrelated pages, which is what the scheduler used to do by
 * putting one plaintext into both `formUrl` and `stopUrl`. Each route resolves
 * exactly its own purpose and refuses every other credential outright; the
 * player's own events page is the untagged one (`purpose is null`), the
 * credential `REQ-person-token` was written for.
 */

export type PlayerAnswer = "yes" | "no";

/** `y`/`n` in the token; kept one character so the plaintext stays short. */
function answerCode(answer: PlayerAnswer): "y" | "n" {
  return answer === "yes" ? "y" : "n";
}

function answerFromCode(code: string): PlayerAnswer | null {
  if (code === "y") return "yes";
  if (code === "n") return "no";
  return null;
}

const UUID_SEGMENT = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** `y.<uuid>.<43-char nonce>` or `n.<uuid>.<43-char nonce>`, and nothing else. */
export const ANSWER_TOKEN_PATTERN = new RegExp(
  `^([yn])\\.(${UUID_SEGMENT})\\.([A-Za-z0-9_-]{43})$`,
);

/** A parsed, but not yet verified, answer token. Parsing is not authorization. */
interface ParsedAnswerToken {
  readonly answer: PlayerAnswer;
  readonly invitationId: string;
}

function parseAnswerToken(token: string): ParsedAnswerToken | null {
  const match = ANSWER_TOKEN_PATTERN.exec(token);
  if (!match) return null;
  const answer = answerFromCode(match[1]);
  if (!answer) return null;
  return { answer, invitationId: match[2] };
}

/**
 * The two path segments the answer links live under — LAN-343's `/a/yes/<t>`
 * and `/a/no/<t>`. A Meta URL button carries a fixed base plus exactly one
 * dynamic suffix, so Yes and No need two bases; the answer stays inside the
 * hashed token as well, and the route checks one against the other, so the
 * segment is never the thing that decides what a click meant.
 */
export type AnswerSegment = "yes" | "no";

/** The answer a segment names, or `null` for any other segment. Parsing is not authorization. */
export function answerForSegment(segment: string): PlayerAnswer | null {
  if (segment === "yes") return "yes";
  if (segment === "no") return "no";
  return null;
}

/** The segment one answer token belongs under, or `null` if it is not an answer token at all. */
export function answerSegmentOf(token: string): AnswerSegment | null {
  const parsed = parseAnswerToken(token);
  return parsed === null ? null : parsed.answer === "yes" ? "yes" : "no";
}

/**
 * The event's start instant, in SQL. Identical expression to
 * `rsvp-tokens.ts` — both modules answer "has this event started?" in the
 * club's own timezone, and a second, slightly different copy would be the
 * kind of drift that makes one of them wrong.
 */
const EVENT_START_EXPRESSION = `
  (e.scheduled_on + coalesce(e.starts_at, '00:00'::time)) at time zone 'Europe/London'`;

export const ANSWER_TOKEN_REQUIRES_AN_INVITATION_RULE =
  "player_answer_token_requires_an_invitation";
export const ANSWER_TOKEN_REQUIRES_A_LIVE_EVENT_RULE = "player_answer_token_requires_a_live_event";

export interface IssuedAnswerToken {
  readonly token: string;
  readonly tokenId: string;
  readonly invitationId: string;
  readonly answer: PlayerAnswer;
}

/**
 * Mints one one-time answer token for one invitation and one button.
 *
 * Called once per button per dispatched message — a Yes token and a No token
 * for the same rung are two calls, two rows, two independent secrets. Neither
 * supersedes the other and neither supersedes an older rung's tokens: an
 * invitee who still has last week's WhatsApp message open can tap it, and
 * `resolveAnswerTokenIn` treats every un-consumed, un-revoked token as live
 * until the event starts or the invitation resolves through some other path
 * (in which case there is simply nothing left for a stale click to change,
 * since responses are idempotent — the whole point of `REQ-no-false-rsvp`'s
 * cousin rule, "reloads and double-taps are idempotent").
 */
export async function issueAnswerTokenIn(
  tx: Tx,
  invitationId: string,
  answer: PlayerAnswer,
  options: { actorPersonId?: string | null } = {},
): Promise<IssuedAnswerToken> {
  const context = await tx.query<{
    person_id: string | null;
    season_id: string;
    event_status: string;
    already_started: boolean;
  }>(
    `select coalesce(i.person_id, m.person_id) as person_id,
            e.season_id,
            e.status::text as event_status,
            ${EVENT_START_EXPRESSION} <= now() as already_started
       from public.invitations i
       join public.events e on e.id = i.event_id
       left join public.season_memberships m on m.id = i.season_membership_id
      where i.id = $1`,
    [invitationId],
  );

  const row = context.rows[0];
  if (!row || !row.person_id) {
    throw new ConstraintViolated(
      "That invitation no longer exists, so no answer link could be issued for it.",
      { rule: ANSWER_TOKEN_REQUIRES_AN_INVITATION_RULE },
    );
  }
  if (row.already_started) {
    throw new InvalidTransition(
      "This event has already started, so a new answer link cannot be issued for it.",
      { rule: ANSWER_TOKEN_REQUIRES_A_LIVE_EVENT_RULE },
    );
  }
  if (row.event_status === "cancelled") {
    throw new InvalidTransition(
      "This event has been cancelled, so a new answer link cannot be issued for it.",
      { rule: ANSWER_TOKEN_REQUIRES_A_LIVE_EVENT_RULE },
    );
  }

  const nonce = mintToken();
  const token = `${answerCode(answer)}.${invitationId}.${nonce}`;

  const inserted = await tx.query<{ id: string }>(
    `insert into public.person_access_tokens
       (person_id, season_id, token_hash, single_use, issued_by_person_id)
     values ($1, $2, $3, true, $4)
     returning id`,
    [row.person_id, row.season_id, hashToken(token), options.actorPersonId ?? null],
  );

  return { token, tokenId: inserted.rows[0].id, invitationId, answer };
}

/** Every reason an answer link may not be used. Kept distinct for logs and tests. */
export type AnswerTokenState = "valid" | "unknown" | "revoked" | "event_started" | "cancelled";

export interface ResolvedAnswerInvitation {
  readonly invitationId: string;
  readonly eventId: string;
  readonly eventName: string;
  readonly eventStatus: string;
  readonly scheduledOn: string | null;
}

export interface AnswerTokenResolution {
  readonly state: AnswerTokenState;
  readonly answer: PlayerAnswer | null;
  readonly invitation: ResolvedAnswerInvitation | null;
  /** True only for a valid token nobody has tapped through yet. */
  readonly writable: boolean;
  /** True once this exact token has recorded its response. Read, never write. */
  readonly consumed: boolean;
}

const UNRESOLVED: AnswerTokenResolution = {
  state: "unknown",
  answer: null,
  invitation: null,
  writable: false,
  consumed: false,
};

/**
 * Resolves an answer token to what it may still do. **Writes nothing** —
 * `REQ-no-false-rsvp` requires the GET this backs to be side-effect-free, so
 * unlike `resolveRsvpTokenIn` this function does not even bump a use counter.
 */
export async function resolveAnswerTokenIn(tx: Tx, token: string): Promise<AnswerTokenResolution> {
  const parsed = parseAnswerToken(token);
  if (!parsed) return UNRESOLVED;

  const result = await tx.query<{
    revoked: boolean;
    single_use_at: Date | null;
    already_started: boolean;
    event_id: string;
    event_name: string;
    event_status: string;
    scheduled_on: string | null;
    resolved_person_id: string | null;
    token_person_id: string;
  }>(
    `select t.revoked_at is not null as revoked,
            t.single_use_at,
            ${EVENT_START_EXPRESSION} <= now() as already_started,
            e.id as event_id, e.name as event_name, e.status::text as event_status,
            to_char(e.scheduled_on, 'YYYY-MM-DD') as scheduled_on,
            coalesce(i.person_id, m.person_id) as resolved_person_id,
            t.person_id as token_person_id
       from public.person_access_tokens t
       join public.invitations i on i.id = $2
       join public.events e on e.id = i.event_id
       left join public.season_memberships m on m.id = i.season_membership_id
      where t.token_hash = $1
        and t.single_use`,
    [hashToken(token), parsed.invitationId],
  );

  const row = result.rows[0];
  // Either the digest matched nothing, or the invitation named inside a
  // tampered-but-still-well-formed string does not exist. Both are `unknown`
  // — a hash miss and a dangling invitation id must read identically, or the
  // shape of the failure becomes information.
  if (!row) return UNRESOLVED;

  // Belt and braces beside the hash: the row this exact digest matches must
  // belong to the same person the invitation itself resolves to. The digest
  // already guarantees the string was never tampered with, so this can only
  // fire if a future bug lets a token be minted against the wrong person —
  // and if it ever does, this is what stops it reaching the page.
  if (row.resolved_person_id !== row.token_person_id) return UNRESOLVED;

  const invitation: ResolvedAnswerInvitation = {
    invitationId: parsed.invitationId,
    eventId: row.event_id,
    eventName: row.event_name,
    eventStatus: row.event_status,
    scheduledOn: row.scheduled_on,
  };

  if (row.revoked) return { ...UNRESOLVED, state: "revoked" };
  // Uniform with LAN-79: once the event has started, reading is over too,
  // whatever this token had or had not recorded. The durable page is where a
  // past answer stays visible; this one-time link's job ends at kickoff.
  if (row.already_started) {
    return {
      state: "event_started",
      answer: parsed.answer,
      invitation,
      writable: false,
      consumed: false,
    };
  }
  if (row.event_status === "cancelled") {
    return {
      state: "cancelled",
      answer: parsed.answer,
      invitation,
      writable: false,
      consumed: false,
    };
  }

  return {
    state: "valid",
    answer: parsed.answer,
    invitation,
    writable: row.single_use_at === null,
    consumed: row.single_use_at !== null,
  };
}

export const ANSWER_TOKEN_CLOSED_RULE = "player_answer_token_closed";

export interface RecordedPlayerAnswer {
  readonly invitationId: string;
  readonly answer: PlayerAnswer;
  readonly personId: string;
  readonly seasonId: string;
  /** Already-consumed double-taps return `false` — nothing was written again. */
  readonly recorded: boolean;
  /**
   * LAN-203. `recruit`, or one of the other three `invitation_capacity`
   * values. The caller uses this to decide where the answer lands — a
   * recruit has no durable `/events/[token]` page to be sent to (there is no
   * event page for them at all, REQ-recruit-sees-public-only).
   */
  readonly capacity: string;
}

/**
 * The one sentence for every reason an answer link may not be used, matching
 * the uniform terminal response LAN-79 already established: no distinction
 * that would tell a caller *which* internal state was the problem.
 */
function closedAnswerLinkMessage(): string {
  return "This link can no longer be used to record a response.";
}

/**
 * Consumes one answer token and records its response, inside the caller's
 * transaction — never opened by this function, because the cookie check that
 * gates the write happens in the route layer and must be able to refuse
 * *before* anything here runs.
 *
 * Idempotent by construction: a token already consumed records nothing a
 * second time and returns `recorded: false`, which is what makes a reload or a
 * double-tap of the same button safe. The *current* standing answer is always
 * whatever `current_rsvp` says, so a reload after consumption is not stale —
 * it is simply not this function's job to report it; the caller reads the page
 * fresh either way.
 *
 * Owner correction round 5 (OWNER-LAN172-12, OWNER-LAN172-13). `options`
 * lets the landing page's own single combined submit both record what the
 * token itself encodes (the ordinary case — `options` omitted, `response`
 * defaults to the token's own `y`/`n`) and the two same-page shortcuts W2
 * asks for: "Plans changed?" on the Yes page and "Change to Yes" on the No
 * page each record the *opposite* of what this specific token encodes.
 * Nothing about this widens what a token can prove — every lookup below is
 * still keyed on this exact token's hash and this exact invitation, so
 * `options.response` only ever changes *what this already-authenticated
 * person's own click means*, never *whose* click it is. `options.reason`
 * carries the player's own typed text, if any, from the same page's reason
 * field, replacing the earlier hardcoded default — a blank or omitted reason
 * still falls back to `NO_REASON_GIVEN_DEFAULT`, exactly as before.
 */
export async function consumeAnswerTokenIn(
  tx: Tx,
  token: string,
  options: { response?: PlayerAnswer; reason?: string | null } = {},
): Promise<RecordedPlayerAnswer> {
  const parsed = parseAnswerToken(token);
  if (!parsed) {
    throw new InvalidTransition(closedAnswerLinkMessage(), { rule: ANSWER_TOKEN_CLOSED_RULE });
  }
  const response = options.response ?? parsed.answer;

  const result = await tx.query<{
    token_id: string;
    person_id: string;
    season_id: string;
    revoked: boolean;
    single_use_at: Date | null;
    already_started: boolean;
    event_status: string;
    resolved_person_id: string | null;
    capacity: string;
  }>(
    `select t.id as token_id, t.person_id, t.season_id,
            t.revoked_at is not null as revoked,
            t.single_use_at,
            ${EVENT_START_EXPRESSION} <= now() as already_started,
            e.status::text as event_status,
            coalesce(i.person_id, m.person_id) as resolved_person_id,
            i.capacity::text as capacity
       from public.person_access_tokens t
       join public.invitations i on i.id = $2
       join public.events e on e.id = i.event_id
       left join public.season_memberships m on m.id = i.season_membership_id
      where t.token_hash = $1
        and t.single_use
      for update of t`,
    [hashToken(token), parsed.invitationId],
  );

  const row = result.rows[0];
  if (!row || row.resolved_person_id !== row.person_id) {
    throw new InvalidTransition(closedAnswerLinkMessage(), { rule: ANSWER_TOKEN_CLOSED_RULE });
  }
  if (row.revoked || row.already_started || row.event_status === "cancelled") {
    throw new InvalidTransition(closedAnswerLinkMessage(), { rule: ANSWER_TOKEN_CLOSED_RULE });
  }

  // Idempotent: a second POST for an already-consumed token changes nothing
  // and is not an error. `rsvp_responses` is append-only, so re-inserting here
  // would either violate the one-answer-per-instant constraint or — worse on a
  // slow retry a second later — silently append a second identical response.
  // Neither is "no false RSVP was created twice"; simply doing nothing is.
  if (row.single_use_at !== null) {
    return {
      invitationId: parsed.invitationId,
      answer: response,
      personId: row.person_id,
      seasonId: row.season_id,
      recorded: false,
      capacity: row.capacity,
    };
  }

  await tx.query(`update public.person_access_tokens set single_use_at = now() where id = $1`, [
    row.token_id,
  ]);

  await recordAnswerIn(
    tx,
    parsed.invitationId,
    {
      response,
      reason: response === "no" ? options.reason?.trim() || NO_REASON_GIVEN_DEFAULT : null,
    },
    { actorLabel: "player: WhatsApp/email answer link", source: "signed_link" },
  );

  return {
    invitationId: parsed.invitationId,
    answer: response,
    personId: row.person_id,
    seasonId: row.season_id,
    recorded: true,
    capacity: row.capacity,
  };
}

/** The default reason a No records before the player supplies a real one. */
export const NO_REASON_GIVEN_DEFAULT = "No reason given";

export interface IssuedPersonToken {
  readonly token: string;
  readonly tokenId: string;
}

/**
 * Which page a durable credential opens — LAN-343.
 *
 * `null` is the player's own events page, the credential this table was
 * created for (`REQ-person-token`). The three named values are the journeys
 * that used to share it: a route accepts exactly one of these and nothing
 * else, so a leaked opt-out link cannot open an onboarding questionnaire and a
 * sign-up link cannot open somebody's events page.
 *
 * `recruit_interest_request` is deliberately absent: Questionnaire B's own
 * credential is minted and resolved by `recruitment-interest-tokens.ts`, under
 * `REQ-two-questionnaires`'s one-open-request-ever rule, which is not this
 * module's rule.
 */
export type PersonTokenPurpose = "onboarding_details" | "recruit_signup" | "messaging_stop";

/**
 * Mints one durable, season-scoped credential for one person and one page.
 *
 * **Revokes nothing.** LAN-343: a link that was sent keeps resolving until its
 * season closes, so a fresh mint stands alongside whatever the person already
 * holds rather than killing it. That is only safe because a plaintext can
 * never be recovered from a digest — a later mint cannot re-send an earlier
 * link, so leaving the earlier link live is the only way the club's own
 * promise ("come back to this link") is true. The trade Brian accepted is
 * that a leaked link stays live for the season; `revokePersonTokenIn` is the
 * escape hatch for one that is known to have leaked.
 */
export async function issuePersonTokenIn(
  tx: Tx,
  personId: string,
  seasonId: string,
  options: { actorPersonId?: string | null; purpose?: PersonTokenPurpose | null } = {},
): Promise<IssuedPersonToken> {
  const token = mintToken();

  const inserted = await tx.query<{ id: string }>(
    `insert into public.person_access_tokens
       (person_id, season_id, token_hash, single_use, purpose, issued_by_person_id)
     values ($1, $2, $3, false, $4::public.person_access_token_purpose, $5)
     returning id`,
    [personId, seasonId, hashToken(token), options.purpose ?? null, options.actorPersonId ?? null],
  );

  return { token, tokenId: inserted.rows[0].id };
}

export interface ResolvedPersonToken {
  readonly personId: string;
  readonly seasonId: string;
}

export type PersonTokenState = "valid" | "unknown";

export interface PersonTokenResolution {
  readonly state: PersonTokenState;
  readonly resolved: ResolvedPersonToken | null;
}

/**
 * Resolves a durable person token for **one** purpose. Writes nothing — the
 * durable page's GET is held to the same no-mutation posture as the answer
 * link's, for the same scanner-safety reason, even though nothing here is
 * single-use to protect.
 *
 * `purpose` is the whole of LAN-343's cross-journey isolation and it is a
 * required argument rather than a default: every caller is a route, every
 * route opens exactly one page, and a credential minted for another page
 * resolves to `unknown` here — the same answer an invented token gets. There
 * is no second resolver to fall through to, which is what makes `/signup/` the
 * recruit gate `/me/join/` never had.
 *
 * A closed season collapses to `unknown` rather than a distinct state: telling
 * a stranger "this credential is real but its season closed" is strictly more
 * than telling them nothing, and `REQ-cross-person-isolation`'s sibling rule —
 * unknown and revoked stay indistinguishable — extends naturally to this third
 * way of no longer resolving. A credential for the wrong purpose collapses the
 * same way, for the same reason.
 */
export async function resolvePersonTokenIn(
  tx: Tx,
  token: string,
  purpose: PersonTokenPurpose | null,
): Promise<PersonTokenResolution> {
  if (!TOKEN_PATTERN.test(token)) return { state: "unknown", resolved: null };

  const result = await tx.query<{ person_id: string; season_id: string }>(
    `select t.person_id, t.season_id
       from public.person_access_tokens t
       join public.seasons s on s.id = t.season_id
      where t.token_hash = $1
        and not t.single_use
        and t.revoked_at is null
        and t.purpose is not distinct from $2::public.person_access_token_purpose
        and s.closed_at is null`,
    [hashToken(token), purpose],
  );

  const row = result.rows[0];
  if (!row) return { state: "unknown", resolved: null };
  return { state: "valid", resolved: { personId: row.person_id, seasonId: row.season_id } };
}

export const REVOCATION_NEEDS_A_REASON_RULE = "person_token_revocation_needs_a_reason";

/**
 * Withdraws a person's live durable credentials without waiting for their
 * season to close — `REQ-person-token`'s explicit, Mission-10-independent
 * escape hatch for a leaked link. Returns how many rows were revoked; zero is
 * legitimate for a person who was never issued one.
 *
 * Every live durable credential for that person and season, across every
 * purpose, unless `purpose` names one. LAN-343 made several coexist, so "the
 * live one" is no longer a thing to revoke: a leak is a leak of a link, and
 * the club cannot tell which of a person's links leaked, so the default is all
 * of them. An omitted `purpose` means every purpose, which is why it is
 * `undefined` and not `null` — `null` is itself a purpose here, the events
 * page's own.
 */
export async function revokePersonTokenIn(
  tx: Tx,
  personId: string,
  seasonId: string,
  reason: string,
  options: { purpose?: PersonTokenPurpose } = {},
): Promise<number> {
  if (reason.trim() === "") {
    throw new ConstraintViolated(
      "Revoking a durable player link has to say why, so the decision can be reviewed later.",
      { rule: REVOCATION_NEEDS_A_REASON_RULE },
    );
  }

  const result = await tx.query(
    `update public.person_access_tokens
        set revoked_at = now(), revoked_reason = $3
      where person_id = $1
        and season_id = $2
        and not single_use
        and revoked_at is null
        and ($4::text is null
             or purpose = $4::public.person_access_token_purpose)`,
    [personId, seasonId, reason.trim(), options.purpose ?? null],
  );

  return result.rowCount ?? 0;
}

/** Convenience wrapper matching `resolveRsvpToken`'s shape, for callers with no open transaction. */
export async function resolveAnswerToken(token: string): Promise<AnswerTokenResolution> {
  return withTransaction((tx) => resolveAnswerTokenIn(tx, token));
}

export async function resolvePersonToken(
  token: string,
  purpose: PersonTokenPurpose | null,
): Promise<PersonTokenResolution> {
  return withTransaction((tx) => resolvePersonTokenIn(tx, token, purpose));
}
