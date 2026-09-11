import "server-only";

import crypto from "node:crypto";

import { withTransaction, type Tx } from "@/lib/db";

/**
 * The season sign-up QR code — `recruitment_signup_codes`, reached through
 * by `W7`'s public sign-up page. Not a secret — plain text, unlike every
 * hashed token elsewhere. Minting is `W1-04`'s surface (a later package).
 * Decision history: LAN-201, LAN-202, missions/intake/M-RECRUITMENT
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
