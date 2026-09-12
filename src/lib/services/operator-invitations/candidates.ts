import type { ResolvedOperator } from "@/lib/auth/operator";
import { withTransaction } from "@/lib/db";
import { deriveOperatorAccountState, type OperatorAccountState } from "../operator-account-state";
import { personDisplayAliasSql } from "../sql-text";
import { assertAdministrationCapability, blankToNull } from "./shared";

/**
 * The duplicate check — {@link findOperatorCandidates} is LAN-141's candidate
 * search: every existing Person who might already be the human being about
 * to be invited. The reviewer diffs this SQL against base; nothing in its
 * body has been touched by the split.
 */

/**
 * Which record a candidate surfaced on.
 *
 * `"email"` used to cover both addresses the club can hold for one human, and
 * the screen then printed the person's *contact* email beside the word — so a
 * search for somebody's sign-in address produced a row captioned with a
 * different address and read as a wrong match. The two are separate here
 * because only the SQL knows which one the term hit.
 */
export type CandidateMatchField =
  "given name" | "family name" | "known as" | "sign-in address" | "contact email" | "phone";

/** Why a candidate surfaced, and the value the search term actually hit. */
export interface CandidateMatch {
  readonly field: CandidateMatchField;
  /** The matched value as the club holds it; `null` only if the record lost it between match and read. */
  readonly value: string | null;
}

export interface OperatorCandidate {
  readonly personId: string;
  readonly givenName: string;
  readonly familyName: string | null;
  readonly displayAlias: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  /** Non-null: this person already has a login and cannot be invited again. */
  readonly operatorAccount: {
    readonly id: string;
    readonly loginEmail: string | null;
    readonly state: OperatorAccountState;
  } | null;
  /** Every record the search term hit, in a fixed order, each with its value. */
  readonly matchedOn: CandidateMatch[];
}

export interface OperatorCandidateQuery {
  readonly givenName?: string | null;
  readonly familyName?: string | null;
  readonly knownAs?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
}

interface CandidateRow {
  person_id: string;
  given_name: string;
  family_name: string | null;
  display_alias: string | null;
  email: string | null;
  phone: string | null;
  operator_account_id: string | null;
  operator_login_email: string | null;
  operator_is_active: boolean | null;
  operator_activated_at: Date | null;
  operator_delivery_failed_at: Date | null;
  operator_email_rehome_pending_at: Date | null;
  matched_given: boolean;
  matched_given_value: string | null;
  matched_family: boolean;
  matched_family_value: string | null;
  matched_known_as: boolean;
  matched_known_as_value: string | null;
  matched_login_email: boolean;
  matched_contact_email: boolean;
  matched_contact_email_value: string | null;
  matched_phone: boolean;
  matched_phone_value: string | null;
}

/**
 * Every existing Person who might already be the human being invited.
 * Deliberately not `roster.findPersonCandidates` — this one has no season
 * dependency. Shares its matching rule (given name, aliases, phone last nine
 * digits) with `roster.ts`; excludes people merged away under invariant I6.
 */
export async function findOperatorCandidates(
  operator: ResolvedOperator | null,
  query: OperatorCandidateQuery,
): Promise<OperatorCandidate[]> {
  // Guarded here, not by the caller screen — see decision history.
  assertAdministrationCapability(operator);

  return withTransaction(async (tx) => {
    const result = await tx.query<CandidateRow>(
      `with wanted as (
         select
           lower(btrim($1::text))   as given_name,
           lower(btrim($2::text))   as family_name,
           lower(btrim($3::text))   as known_as,
           lower(btrim($4::text))   as email,
           nullif(right(regexp_replace(coalesce($5::text, ''), '\\D', '', 'g'), 9), '') as phone_tail
       ),
       alias_match as (
         select a.person_id,
                bool_or(lower(btrim(a.alias)) = w.given_name)  as by_given,
                bool_or(lower(btrim(a.alias)) = w.family_name) as by_family,
                bool_or(lower(btrim(a.alias)) = w.known_as)    as by_known_as,
                -- The alias as the club spells it, not as the search spelled
                -- it: the caption names the record that matched and shows what
                -- is in it, so an operator can see the two are the same human.
                max(a.alias) filter (where lower(btrim(a.alias)) = w.given_name)  as given_alias,
                max(a.alias) filter (where lower(btrim(a.alias)) = w.family_name) as family_alias,
                max(a.alias) filter (where lower(btrim(a.alias)) = w.known_as)    as known_as_alias
           from public.person_aliases a
           cross join wanted w
          group by a.person_id
       ),
       contact_match as (
         select c.person_id,
                bool_or(c.kind = 'email' and lower(btrim(c.raw_value)) = w.email) as by_email,
                max(c.raw_value) filter (
                  where c.kind = 'email' and lower(btrim(c.raw_value)) = w.email
                ) as email_value,
                bool_or(
                  c.kind = 'phone'
                  and w.phone_tail is not null
                  and nullif(right(regexp_replace(c.raw_value, '\\D', '', 'g'), 9), '') = w.phone_tail
                ) as by_phone,
                -- The number the club holds, in the club's formatting; the
                -- search matches on the last nine digits, so the term itself
                -- is frequently not what the record says.
                max(c.raw_value) filter (
                  where c.kind = 'phone'
                    and w.phone_tail is not null
                    and nullif(right(regexp_replace(c.raw_value, '\\D', '', 'g'), 9), '') = w.phone_tail
                ) as phone_value
           from public.contact_points c
           cross join wanted w
          group by c.person_id
       ),
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
         p.id                       as person_id,
         p.given_name,
         p.family_name,
         ${personDisplayAliasSql("p")} as display_alias,
         display_contact.email,
         display_contact.phone,
         oa.id                      as operator_account_id,
         oa.login_email             as operator_login_email,
         oa.is_active               as operator_is_active,
         oa.activated_at            as operator_activated_at,
         oa.invitation_delivery_failed_at as operator_delivery_failed_at,
         oa.email_rehome_pending_at as operator_email_rehome_pending_at,
         coalesce(lower(btrim(p.given_name)) = w.given_name
                  or am.by_given, false)    as matched_given,
         case when lower(btrim(p.given_name)) = w.given_name
              then p.given_name else am.given_alias end  as matched_given_value,
         coalesce(lower(btrim(p.family_name)) = w.family_name
                  or am.by_family, false)   as matched_family,
         case when lower(btrim(p.family_name)) = w.family_name
              then p.family_name else am.family_alias end as matched_family_value,
         -- No known-as arm: LAN-182 moved that value into person_aliases,
         -- which the alias_match CTE above already scans, so am.by_known_as
         -- catches what the struck column used to catch.
         coalesce(lower(btrim(p.given_name)) = w.known_as
                  or am.by_known_as, false) as matched_known_as,
         case when lower(btrim(p.given_name)) = w.known_as
              then p.given_name else am.known_as_alias end as matched_known_as_value,
         -- An address already in use as a login is a match on the address.
         -- Without this arm the search could see the row, print the login it
         -- had just read, and still report that nobody matched. It is reported
         -- apart from a contact-email match because they are different records
         -- holding different addresses, and the caption has to name which one
         -- the operator's term hit — the screen used to print the contact
         -- address under either, so a search for somebody's sign-in address
         -- produced a row showing an address they had not typed.
         coalesce(lower(btrim(oa.login_email)) = w.email, false) as matched_login_email,
         coalesce(cm.by_email, false)       as matched_contact_email,
         cm.email_value                     as matched_contact_email_value,
         coalesce(cm.by_phone, false)       as matched_phone,
         cm.phone_value                     as matched_phone_value
       from public.people p
       cross join wanted w
       left join alias_match   am on am.person_id = p.id
       left join contact_match cm on cm.person_id = p.id
       left join display_contact  on display_contact.person_id = p.id
       left join public.operator_accounts oa on oa.person_id = p.id
      where p.merged_into_person_id is null
        and (
          lower(btrim(p.given_name)) = w.given_name
          or lower(btrim(p.family_name)) = w.family_name
          or lower(btrim(p.given_name)) = w.known_as
          or coalesce(am.by_given or am.by_family or am.by_known_as, false)
          or coalesce(cm.by_email or cm.by_phone, false)
          -- REQ-invitation-states requires a duplicate address to be refused
          -- with an actionable reason. An operator login is an address the club
          -- holds, and it is frequently the *only* one it holds: nothing copies
          -- a login into contact_points, so an administrator who invited
          -- somebody at their work address and later searched for that address
          -- was told "Nobody in the club's records matches. A new record will
          -- be created." The send then failed on the unique index — fail-closed,
          -- so no duplicate was ever written, but the screen had already
          -- promised the opposite and the error named a constraint rather than
          -- the person. Matching here is what makes the refusal actionable.
          or lower(btrim(oa.login_email)) = w.email
        )
      order by p.family_name nulls last, p.given_name, p.id`,
      [
        blankToNull(query.givenName),
        blankToNull(query.familyName),
        blankToNull(query.knownAs),
        blankToNull(query.email),
        blankToNull(query.phone),
      ],
    );

    return result.rows.map(toCandidate);
  });
}

function toCandidate(row: CandidateRow): OperatorCandidate {
  const matchedOn: CandidateMatch[] = [];
  if (row.matched_given) matchedOn.push({ field: "given name", value: row.matched_given_value });
  if (row.matched_family) matchedOn.push({ field: "family name", value: row.matched_family_value });
  if (row.matched_known_as)
    matchedOn.push({ field: "known as", value: row.matched_known_as_value });
  if (row.matched_login_email)
    matchedOn.push({ field: "sign-in address", value: row.operator_login_email });
  if (row.matched_contact_email)
    matchedOn.push({ field: "contact email", value: row.matched_contact_email_value });
  if (row.matched_phone) matchedOn.push({ field: "phone", value: row.matched_phone_value });

  return {
    personId: row.person_id,
    givenName: row.given_name,
    familyName: row.family_name,
    displayAlias: row.display_alias,
    email: row.email,
    phone: row.phone,
    operatorAccount:
      row.operator_account_id === null
        ? null
        : {
            id: row.operator_account_id,
            loginEmail: row.operator_login_email,
            state: deriveOperatorAccountState({
              isActive: row.operator_is_active === true,
              activatedAt: row.operator_activated_at,
              invitationDeliveryFailedAt: row.operator_delivery_failed_at,
              emailChangePending: row.operator_email_rehome_pending_at !== null,
            }),
          },
    matchedOn,
  };
}
