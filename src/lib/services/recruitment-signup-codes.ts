import "server-only";

import crypto from "node:crypto";

import { withTransaction, type Tx } from "@/lib/db";

/**
 * The season sign-up QR code — `recruitment_signup_codes`, reached through
 * by `W7`'s public sign-up page. Not a secret — plain text, unlike every
 * hashed token elsewhere. Minting is `W1-04`'s surface (a later package).
 */

function generateCode(): string {
  return crypto.randomBytes(9).toString("base64url");
}

export interface MintedSignupCode {
  readonly id: string;
  readonly code: string;
  readonly seasonId: string;
}

/** Mints a fresh live code, deactivating whatever was live first (`recruitment_signup_codes_one_live_per_season`). Re-minting supersedes the old code — W1-04. */
export async function mintRecruitmentSignupCodeIn(
  tx: Tx,
  seasonId: string,
  options: { mintedByPersonId?: string | null } = {},
): Promise<MintedSignupCode> {
  await tx.query(
    `update public.recruitment_signup_codes
        set deactivated_at = now(), deactivated_reason = 'Superseded by a freshly minted code.'
      where season_id = $1::uuid and deactivated_at is null`,
    [seasonId],
  );

  const code = generateCode();
  const inserted = await tx.query<{ id: string }>(
    `insert into public.recruitment_signup_codes (season_id, code, minted_by_person_id)
     values ($1::uuid, $2, $3)
     returning id`,
    [seasonId, code, options.mintedByPersonId ?? null],
  );

  return { id: inserted.rows[0].id, code, seasonId };
}

type SignupCodeState = "valid" | "unknown";

export interface ResolvedSignupCode {
  readonly state: SignupCodeState;
  readonly seasonId: string | null;
}

const UNRESOLVED: ResolvedSignupCode = { state: "unknown", seasonId: null };

/** Resolves a code to its season, or `unknown` (never-existed and deactivated read identically, Task 09 §2.1). Writes nothing. */
export async function resolveRecruitmentSignupCodeIn(
  tx: Tx,
  code: string,
): Promise<ResolvedSignupCode> {
  if (code.trim() === "") return UNRESOLVED;

  const result = await tx.query<{ season_id: string }>(
    `select season_id from public.recruitment_signup_codes
      where code = $1 and deactivated_at is null`,
    [code],
  );
  const row = result.rows[0];
  return row ? { state: "valid", seasonId: row.season_id } : UNRESOLVED;
}

export async function resolveRecruitmentSignupCode(code: string): Promise<ResolvedSignupCode> {
  return withTransaction((tx) => resolveRecruitmentSignupCodeIn(tx, code));
}

export interface LiveSignupCode {
  readonly id: string;
  readonly code: string;
  readonly mintedAt: string;
  readonly signInCount: number;
}

/** The season's one live code, for `W1-04`'s page — `null` when nothing has been minted (`recruitment_signup_codes_one_live_per_season`). */
export async function readLiveRecruitmentSignupCodeIn(
  tx: Tx,
  seasonId: string,
): Promise<LiveSignupCode | null> {
  const result = await tx.query<{
    id: string;
    code: string;
    minted_at: Date;
    sign_in_count: number;
  }>(
    `select id, code, minted_at, sign_in_count
       from public.recruitment_signup_codes
      where season_id = $1::uuid and deactivated_at is null`,
    [seasonId],
  );
  const row = result.rows[0];
  return row
    ? {
        id: row.id,
        code: row.code,
        mintedAt: row.minted_at.toISOString(),
        signInCount: row.sign_in_count,
      }
    : null;
}

export async function recordRecruitmentSignupCodeUseIn(tx: Tx, code: string): Promise<void> {
  await tx.query(
    `update public.recruitment_signup_codes
        set sign_in_count = sign_in_count + 1
      where code = $1 and deactivated_at is null`,
    [code],
  );
}

/**
 * LAN-428, item 4. Resolves the code exactly as {@link resolveRecruitmentSignupCodeIn}
 * does and, for a live code, counts one visit in the same statement. What
 * `/join/[code]` calls when it is served; an unknown or deactivated code
 * counts nothing and reads as `unknown`, as before.
 */
export async function recordRecruitmentSignupVisitIn(
  tx: Tx,
  code: string,
): Promise<ResolvedSignupCode> {
  if (code.trim() === "") return UNRESOLVED;

  const result = await tx.query<{ season_id: string }>(
    `update public.recruitment_signup_codes
        set visit_count = visit_count + 1
      where code = $1 and deactivated_at is null
      returning season_id`,
    [code],
  );
  const row = result.rows[0];
  return row ? { state: "valid", seasonId: row.season_id } : UNRESOLVED;
}

/**
 * LAN-428, item 3 (Brian, 2026-09-26). The club's own test sign-ups before the
 * Saïd fair were counted as completed sign-ups on the live code; Completed
 * displays the stored count less this many. The stored `sign_in_count` is not
 * changed. Remove this constant, and its one use in
 * {@link readRecruitmentSignupFiguresIn}, when the season's code is re-minted
 * (a new code starts at zero and has no test sign-ups) or when the 2026-27
 * recruitment season is over.
 */
export const COMPLETED_SIGNUPS_TEST_OFFSET = 12;

/** A partial's door — `PARTIAL_SOURCE` in `recruitment-signup.ts`, restated to avoid an import cycle; a test holds the two equal. */
export const PARTIAL_DOOR = "qr_partial";

export interface RecruitmentSignupFigures {
  /** Times the sign-up page was opened through the live code. */
  readonly visits: number;
  /** Partial records the sign-up page created through the live code, whether or not later completed. */
  readonly partial: number;
  /** Completed sign-ups on the live code, less {@link COMPLETED_SIGNUPS_TEST_OFFSET}, never below zero. */
  readonly completed: number;
}

/**
 * The three numbers at the top of `/operate/recruitment/qr` — LAN-428, item 4.
 * `null` when the season has no live code. Partial is counted from the
 * `person_created` audit row every partial writes (door `qr_partial`) since the
 * live code was minted, because a partial's own `source` flips to
 * `qr_self_entry` once it is complete and the count must include those.
 */
export async function readRecruitmentSignupFiguresIn(
  tx: Tx,
  seasonId: string,
): Promise<RecruitmentSignupFigures | null> {
  const result = await tx.query<{ visit_count: number; sign_in_count: number; partial: number }>(
    `select c.visit_count,
            c.sign_in_count,
            (select count(*)::int
               from public.audit_events a
              where a.action = 'person_created'
                and a.entity_table = 'people'
                and a.context ->> 'door' = $2
                and a.context ->> 'season_id' = c.season_id::text
                and a.occurred_at >= c.minted_at) as partial
       from public.recruitment_signup_codes c
      where c.season_id = $1::uuid and c.deactivated_at is null`,
    [seasonId, PARTIAL_DOOR],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    visits: row.visit_count,
    partial: row.partial,
    completed: Math.max(0, row.sign_in_count - COMPLETED_SIGNUPS_TEST_OFFSET),
  };
}
