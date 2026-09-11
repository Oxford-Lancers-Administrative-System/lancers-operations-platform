import "server-only";

import { type Tx } from "@/lib/db";
import { hashToken, mintToken, TOKEN_PATTERN } from "./rsvp-tokens";

/**
 * The credential Questionnaire B's ask and reminder carry — LAN-206.
 * `single_use = true` despite resolving repeatedly, to avoid colliding with
 * `person_access_tokens_one_live_per_person_season`; this resolver never
 * writes `single_use_at`, so "consumed, now dead" never applies here.
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

interface ResolvedRecruitmentInterestToken {
  readonly personId: string;
  readonly seasonId: string;
  readonly prospectId: string;
  readonly displayName: string;
}

type RecruitmentInterestTokenState = "valid" | "unknown";

export interface RecruitmentInterestTokenResolution {
  readonly state: RecruitmentInterestTokenState;
  readonly resolved: ResolvedRecruitmentInterestToken | null;
}

const UNRESOLVED: RecruitmentInterestTokenResolution = { state: "unknown", resolved: null };

/** Resolves a Questionnaire B link. Writes nothing. `unknown` covers every invalid case alike — uniform-invalid (E1). */
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
