import "server-only";

import { withTransaction } from "@/lib/db";
import { personDisplayAliasSql } from "../sql-text";
import {
  normaliseInput,
  resolveOpenSeason,
  type CandidateMatch,
  type PersonCandidate,
  type ReturnerIntakeInput,
} from "./shared";

/**
 * The member-facing duplicate check — LAN-74/LAN-146 A1. Moved unchanged
 * from `roster.ts`; see `relocations.md` for the module's full design note.
 */

interface CandidateRow {
  person_id: string;
  given_name: string;
  family_name: string | null;
  display_alias: string | null;
  email: string | null;
  phone: string | null;
  membership_id: string | null;
  membership_status: string | null;
  season_label: string;
  matched_given: boolean;
  matched_family: boolean;
  matched_known_as: boolean;
  matched_email: boolean;
  matched_phone: boolean;
}

/**
 * Every existing Person who might already be the human being entered. A
 * given name alone is enough to match — a quarter of the squad is recorded
 * first-name-only, and a tight match would hide exactly the duplicates this
 * check exists to catch (the cost of loose is a longer list; the cost of
 * tight is an audited merge, invariant I6). Aliases count too
 * (`person_aliases`). Phones compare on their last nine digits. Excludes
 * people merged away under invariant I6.
 */
export async function findPersonCandidates(input: ReturnerIntakeInput): Promise<PersonCandidate[]> {
  const normalised = normaliseInput(input);

  return withTransaction(async (tx) => {
    // Resolved first: an operator who cannot create a membership at all should learn that before typing more.
    const season = await resolveOpenSeason(tx);

    const result = await tx.query<CandidateRow>(
      `with wanted as (
         select
           lower($1::text)          as given_name,
           lower($2::text)          as family_name,
           lower($3::text)          as known_as,
           lower($4::text)          as email,
           nullif(right(regexp_replace(coalesce($5::text, ''), '\\D', '', 'g'), 9), '') as phone_tail
       ),
       alias_match as (
         select a.person_id,
                bool_or(lower(btrim(a.alias)) = w.given_name)  as by_given,
                bool_or(lower(btrim(a.alias)) = w.family_name) as by_family,
                bool_or(lower(btrim(a.alias)) = w.known_as)    as by_known_as
           from public.person_aliases a
           cross join wanted w
          group by a.person_id
       ),
       contact_match as (
         select c.person_id,
                bool_or(c.kind = 'email' and lower(btrim(c.raw_value)) = w.email) as by_email,
                bool_or(
                  c.kind = 'phone'
                  and w.phone_tail is not null
                  and nullif(right(regexp_replace(c.raw_value, '\\D', '', 'g'), 9), '') = w.phone_tail
                ) as by_phone
           from public.contact_points c
           cross join wanted w
          group by c.person_id
       ),
       -- The contact values shown on UX-11. Preferred first, then anything
       -- current — because this module now records a supplied contact as
       -- *not* preferred when the person already has one of that kind, and a
       -- candidate list that showed those as "—" would drop the field the
       -- operator's decision most depends on.
       preferred as (
         select distinct on (person_id, kind) person_id, kind, raw_value
           from public.contact_points
          where valid_until is null
          order by person_id, kind, is_preferred desc, created_at desc
       ),
       display_contact as (
         select person_id,
                max(raw_value) filter (where kind = 'email') as email,
                max(raw_value) filter (where kind = 'phone') as phone
           from preferred
          group by person_id
       )
       select
         p.id                                             as person_id,
         p.given_name,
         p.family_name,
         ${personDisplayAliasSql("p")}                     as display_alias,
         display_contact.email,
         display_contact.phone,
         m.id                                             as membership_id,
         m.status::text                                   as membership_status,
         $7::text                                         as season_label,
         -- btrim on the stored side as well as the typed side. Names are
         -- stored as intake received them, and people_given_name_not_blank
         -- only forbids an all-whitespace value — so ' Bertram ' is a legal
         -- row, and an import will eventually produce one. Comparing it
         -- untrimmed hides exactly the duplicate this check exists to find.
         coalesce(lower(btrim(p.given_name)) = w.given_name
                  or am.by_given, false)                  as matched_given,
         coalesce(lower(btrim(p.family_name)) = w.family_name
                  or am.by_family, false)                 as matched_family,
         -- No known-as arm any more, and nothing is lost by its absence:
         -- LAN-182 moved that value into person_aliases, which the alias_match
         -- CTE above already scans. What the struck column used to catch,
         -- am.by_known_as and am.by_given now catch from where it actually is.
         coalesce(lower(btrim(p.given_name)) = w.known_as
                  or am.by_known_as, false)               as matched_known_as,
         coalesce(cm.by_email, false)                     as matched_email,
         coalesce(cm.by_phone, false)                     as matched_phone
       from public.people p
       cross join wanted w
       left join alias_match   am on am.person_id = p.id
       left join contact_match cm on cm.person_id = p.id
       left join display_contact  on display_contact.person_id = p.id
       left join public.season_memberships m
              on m.person_id = p.id and m.season_id = $6::uuid
      where p.merged_into_person_id is null
        and (
          lower(btrim(p.given_name)) = w.given_name
          or lower(btrim(p.family_name)) = w.family_name
          or lower(btrim(p.given_name)) = w.known_as
          or coalesce(am.by_given or am.by_family or am.by_known_as, false)
          or coalesce(cm.by_email or cm.by_phone, false)
        )
      order by p.family_name nulls last, p.given_name, p.id`,
      [
        normalised.givenName,
        normalised.familyName,
        normalised.knownAs,
        normalised.email?.compare ?? null,
        normalised.phone?.compare ?? null,
        season.id,
        season.label,
      ],
    );

    return result.rows.map(toCandidate);
  });
}

function toCandidate(row: CandidateRow): PersonCandidate {
  const matchedOn: CandidateMatch[] = [];
  if (row.matched_given) matchedOn.push("given name");
  if (row.matched_family) matchedOn.push("family name");
  if (row.matched_known_as) matchedOn.push("known as");
  if (row.matched_email) matchedOn.push("email");
  if (row.matched_phone) matchedOn.push("phone");

  return {
    personId: row.person_id,
    givenName: row.given_name,
    familyName: row.family_name,
    displayAlias: row.display_alias,
    email: row.email,
    phone: row.phone,
    currentMembership:
      row.membership_id && row.membership_status
        ? { id: row.membership_id, status: row.membership_status, seasonLabel: row.season_label }
        : null,
    matchedOn,
  };
}
