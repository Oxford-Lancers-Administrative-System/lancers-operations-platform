import "server-only";

import { withTransaction, type Tx } from "@/lib/db";
import { hashToken, mintToken, TOKEN_PATTERN } from "./rsvp-tokens";

/**
 * The credential Questionnaire B's ask and reminder carry — LAN-206, the
 * 2026-09-01 amendment's own send machinery.
 *
 * ## Why this is `single_use = true` despite resolving repeatedly
 *
 * The credential's own *behaviour* is the player-page credential's: durable,
 * re-resolvable across repeat visits, never dead the moment it is used once
 * — Questionnaire B's own Done-when is explicit that a recruit answering
 * twice supersedes the earlier answer, which is kept, and W4's exceptions
 * name the same visit answered twice. But `single_use = false` is exactly
 * what `person_access_tokens_one_live_per_person_season` — the *existing*
 * partial index, keyed on `(person_id, season_id)` alone and blind to
 * `purpose` — already claims for the player-page credential itself.
 * `dispatchRecruitmentCycleJob` mints both credentials in the same
 * transaction (the opt-out link is always the durable one, whichever step is
 * sending), so a second `not single_use` row for the same `(person_id,
 * season_id)` collides with that index the moment both exist together —
 * proved by `recruitment-cycle-dispatch.test.ts`'s own end-to-end suite, not
 * a hypothetical. `single_use = true` opts this credential *out* of that
 * older index entirely (its own `where not single_use` no longer matches),
 * while this module's own resolver never writes `single_use_at`, so nothing
 * about the column's usual RSVP-token meaning ("consumed, and now dead")
 * applies here — `purpose` (LAN-206's own migration) and
 * `person_access_tokens_one_open_purpose_request` are this credential's own,
 * separate substrate, entirely independent of the `single_use` flag's
 * original meaning.
 *
 * ## One open request per person, ever
 *
 * {@link issueRecruitmentInterestTokenIn} is a straight revoke-then-insert —
 * `issuePersonTokenIn`'s own idiom, parameterised by `purpose` instead of
 * `season_id`. The partial unique index is the substrate that makes this
 * safe under a race; the function's own ordering (revoke, then insert) is
 * what makes it correct under the ordinary, single-writer case. Every fresh
 * mint — the ask, then its one reminder — supersedes whatever was open
 * before it, which is also what "an expired or revoked link" (W4-03) means
 * in practice: the ask's own link goes dead the moment the reminder mints
 * its own.
 */

const PURPOSE = "recruit_interest_request";

export interface IssuedRecruitmentInterestToken {
  readonly token: string;
  readonly tokenId: string;
}

export async function issueRecruitmentInterestTokenIn(
  tx: Tx,
  personId: string,
  seasonId: string,
  options: { actorPersonId?: string | null } = {},
): Promise<IssuedRecruitmentInterestToken> {
  const token = mintToken();

  await tx.query(
    `update public.person_access_tokens
        set revoked_at = now(),
            revoked_reason = 'Superseded by a freshly issued Questionnaire B link.'
      where person_id = $1
        and purpose = $2::public.person_access_token_purpose
        and revoked_at is null`,
    [personId, PURPOSE],
  );

  const inserted = await tx.query<{ id: string }>(
    `insert into public.person_access_tokens
       (person_id, season_id, token_hash, single_use, purpose, issued_by_person_id)
     values ($1, $2, $3, true, $4::public.person_access_token_purpose, $5)
     returning id`,
    [personId, seasonId, hashToken(token), PURPOSE, options.actorPersonId ?? null],
  );

  return { token, tokenId: inserted.rows[0].id };
}

export interface ResolvedRecruitmentInterestToken {
  readonly personId: string;
  readonly seasonId: string;
  readonly prospectId: string;
  readonly displayName: string;
}

export type RecruitmentInterestTokenState = "valid" | "unknown";

export interface RecruitmentInterestTokenResolution {
  readonly state: RecruitmentInterestTokenState;
  readonly resolved: ResolvedRecruitmentInterestToken | null;
}

const UNRESOLVED: RecruitmentInterestTokenResolution = { state: "unknown", resolved: null };

/**
 * Resolves a Questionnaire B link. **Writes nothing** — the same
 * side-effect-free GET rule `resolveAnswerTokenIn`/`resolvePersonTokenIn`
 * already keep, so a scanner or a link preview fetching this before a human
 * does changes nothing.
 *
 * `unknown` covers a malformed token, a hash miss, a revoked row and a row
 * whose prospect no longer exists for this (person, season) alike — the
 * uniform-invalid rule (E1) that a caller must not be able to tell those
 * apart from the outside.
 */
export async function resolveRecruitmentInterestTokenIn(
  tx: Tx,
  token: string,
): Promise<RecruitmentInterestTokenResolution> {
  if (!TOKEN_PATTERN.test(token)) return UNRESOLVED;

  const result = await tx.query<{
    person_id: string;
    season_id: string;
    given_name: string;
    family_name: string | null;
    prospect_id: string | null;
  }>(
    `select t.person_id, t.season_id, p.given_name, p.family_name, rp.id as prospect_id
       from public.person_access_tokens t
       join public.people p on p.id = t.person_id
       left join public.recruitment_prospects rp
         on rp.person_id = t.person_id and rp.season_id = t.season_id
      where t.token_hash = $1
        and t.purpose = $2::public.person_access_token_purpose
        and t.revoked_at is null`,
    [hashToken(token), PURPOSE],
  );

  const row = result.rows[0];
  if (!row || !row.prospect_id) return UNRESOLVED;

  return {
    state: "valid",
    resolved: {
      personId: row.person_id,
      seasonId: row.season_id,
      prospectId: row.prospect_id,
      displayName: [row.given_name, row.family_name].filter(Boolean).join(" "),
    },
  };
}

export async function resolveRecruitmentInterestToken(
  token: string,
): Promise<RecruitmentInterestTokenResolution> {
  return withTransaction((tx) => resolveRecruitmentInterestTokenIn(tx, token));
}
