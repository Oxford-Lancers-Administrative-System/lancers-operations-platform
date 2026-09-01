import "server-only";

import crypto from "node:crypto";

import { withTransaction, type Tx } from "@/lib/db";

/**
 * The season sign-up QR code — LAN-201's `recruitment_signup_codes`, and the
 * substrate `W7`'s public sign-up page (`WP-signup-gate`, LAN-202) is reached
 * through. `recruitment_signup_codes.code` is deliberately not a secret (the
 * migration's own comment: "reaching it only opens the public sign-up page —
 * nothing about the club is exposed by knowing it"), so this module stores and
 * compares it as plain text, unlike every hashed token elsewhere in the
 * service layer.
 *
 * Minting the code is `W1-04`'s administration surface — a later package's
 * (the recruit board) own button — and this module does not build that screen.
 * {@link mintRecruitmentSignupCodeIn} exists here, minimal, only because
 * `WP-signup-gate`'s own acceptance criteria need a live code to prove the QR
 * door end to end, and because it is the one function `W1-04` will want
 * ready-made when it builds that button.
 */

/** URL-safe, unguessable enough to not collide, short enough to print. Not a secret. */
function generateCode(): string {
  return crypto.randomBytes(9).toString("base64url");
}

export interface MintedSignupCode {
  readonly id: string;
  readonly code: string;
  readonly seasonId: string;
}

/**
 * Mints a fresh live code for a season, deactivating whatever was live first —
 * `recruitment_signup_codes_one_live_per_season` is what makes that order
 * (deactivate, then insert) the only safe one, the same partial-unique-index
 * idiom `person_access_tokens` already uses for its own "one live" guarantee.
 *
 * Idempotent in effect, not in call count: calling this on a season that
 * already has a live code re-mints — the old code stops resolving and a new
 * one takes over — which is exactly `W1-04`'s "mintable, deactivatable and
 * re-mintable."
 */
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

export type SignupCodeState = "valid" | "unknown";

export interface ResolvedSignupCode {
  readonly state: SignupCodeState;
  readonly seasonId: string | null;
}

const UNRESOLVED: ResolvedSignupCode = { state: "unknown", seasonId: null };

/**
 * Resolves a code to the season it opens the sign-up form for, or `unknown` —
 * a code that never existed and a code that was deactivated read identically,
 * on the same uniform-invalid-page contract every other public token surface
 * in this application follows (Task 09 §2.1). Writes nothing; the caller
 * records the sign-in separately, only once the form is actually saved.
 */
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

/** Convenience wrapper for a caller with no open transaction. */
export async function resolveRecruitmentSignupCode(code: string): Promise<ResolvedSignupCode> {
  return withTransaction((tx) => resolveRecruitmentSignupCodeIn(tx, code));
}

/**
 * Bumps the code's own sign-in counter — `W1-04`'s "N people have signed in
 * through it this season." Called once per successful save through the QR
 * door, never on a mere page view (the GET stays side-effect-free, matching
 * every other public token page in this application).
 */
export async function recordRecruitmentSignupCodeUseIn(tx: Tx, code: string): Promise<void> {
  await tx.query(
    `update public.recruitment_signup_codes
        set sign_in_count = sign_in_count + 1
      where code = $1 and deactivated_at is null`,
    [code],
  );
}
