import "server-only";

import { ConstraintViolated, withTransaction, type Tx } from "@/lib/db";
import { personDisplayAliasSql } from "./sql-text";

/**
 * The one duplicate check — LAN-183, `REQ-duplicate-check`. `main` has three
 * separate implementations of this question (`roster.ts`'s
 * `findPersonCandidates` among them, `DEC-w3-09`); this is the canonical one
 * for W3's "add or link a person" and every later caller, matching on every
 * contact value a candidate supplies. Read-only: the write that follows
 * (minting a person) is a later package's, where the reason and audit row
 * belong.
 */

export type PersonDuplicateMatch = "given_name" | "family_name" | "alias" | "email" | "phone";

export interface PersonDuplicateCandidate {
  personId: string;
  givenName: string;
  familyName: string | null;
  displayAlias: string | null;
  displayName: string;
  currentEmails: string[];
  currentPhones: string[];
  /** Every field that matched, in a stable order. Never empty. */
  matchedOn: PersonDuplicateMatch[];
}

export interface PersonDuplicateQuery {
  givenName: string;
  familyName?: string | null;
  emails?: readonly string[];
  phones?: readonly string[];
}

function normaliseTerm(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed.toLowerCase();
}

function normaliseList(values: readonly string[] | undefined): string[] {
  if (!values) return [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalised = normaliseTerm(value);
    if (normalised) seen.add(normalised);
  }
  return [...seen];
}

interface CandidateRow {
  person_id: string;
  given_name: string;
  family_name: string | null;
  display_alias: string | null;
  matched_given: boolean;
  matched_family: boolean;
  matched_alias: boolean;
  matched_email: boolean;
  matched_phone: boolean;
}

async function readCurrentContacts(
  tx: Tx,
  personIds: readonly string[],
): Promise<Map<string, { emails: string[]; phones: string[] }>> {
  const byPerson = new Map<string, { emails: string[]; phones: string[] }>();
  if (personIds.length === 0) return byPerson;

  const result = await tx.query<{ person_id: string; kind: "email" | "phone"; raw_value: string }>(
    `select person_id, kind::text as kind, raw_value
       from public.contact_points
      where person_id = any($1::uuid[]) and valid_until is null
      order by is_preferred desc, created_at desc`,
    [personIds],
  );

  for (const row of result.rows) {
    const entry = byPerson.get(row.person_id) ?? { emails: [], phones: [] };
    if (row.kind === "email") entry.emails.push(row.raw_value);
    else entry.phones.push(row.raw_value);
    byPerson.set(row.person_id, entry);
  }
  return byPerson;
}

function displayNameFrom(
  givenName: string,
  familyName: string | null,
  displayAlias: string | null,
): string {
  const trimmedAlias = displayAlias?.trim();
  const first = trimmedAlias ? trimmedAlias : givenName;
  return familyName ? `${first} ${familyName}` : first;
}

function matchedOnFrom(row: CandidateRow): PersonDuplicateMatch[] {
  const matched: PersonDuplicateMatch[] = [];
  if (row.matched_given) matched.push("given_name");
  if (row.matched_family) matched.push("family_name");
  if (row.matched_alias) matched.push("alias");
  if (row.matched_email) matched.push("email");
  if (row.matched_phone) matched.push("phone");
  return matched;
}

/** Every existing, non-merged-away person who might already be the human described by `query`. Loose on purpose. Refuses to run with nothing to match on. */
export async function findPersonDuplicates(
  query: PersonDuplicateQuery,
): Promise<PersonDuplicateCandidate[]> {
  const givenName = normaliseTerm(query.givenName);
  const familyName = normaliseTerm(query.familyName);
  const emails = normaliseList(query.emails);
  const phones = normaliseList(query.phones);

  if (!givenName && !familyName && emails.length === 0 && phones.length === 0) {
    throw new ConstraintViolated(
      "The duplicate check needs at least a name or a contact value to match on.",
      { rule: "person_duplicate_check_requires_a_term" },
    );
  }

  return withTransaction(async (tx) => {
    const result = await tx.query<CandidateRow>(
      `with wanted_emails as (select unnest($3::text[]) as email),
            wanted_phones as (select unnest($4::text[]) as phone_tail)
       select
         p.id as person_id,
         p.given_name,
         p.family_name,
         ${personDisplayAliasSql("p")} as display_alias,
         coalesce($1::text is not null and lower(btrim(p.given_name)) = $1, false) as matched_given,
         coalesce($2::text is not null and lower(btrim(p.family_name)) = $2, false) as matched_family,
         coalesce(
           (
             $1::text is not null
             and exists (
               select 1 from public.person_aliases a
                where a.person_id = p.id and lower(btrim(a.alias)) = $1
             )
           )
           or (
             $2::text is not null
             and exists (
               select 1 from public.person_aliases a
                where a.person_id = p.id and lower(btrim(a.alias)) = $2
             )
           ),
           false
         ) as matched_alias,
         coalesce(
           exists (
             select 1 from public.contact_points c
              where c.person_id = p.id and c.kind = 'email'
                and lower(btrim(c.raw_value)) in (select email from wanted_emails)
           ),
           false
         ) as matched_email,
         coalesce(
           exists (
             select 1 from public.contact_points c
              where c.person_id = p.id and c.kind = 'phone'
                and nullif(right(regexp_replace(c.raw_value, '\\D', '', 'g'), 9), '')
                    in (select phone_tail from wanted_phones)
           ),
           false
         ) as matched_phone
       from public.people p
      where p.merged_into_person_id is null
        and (
          ($1::text is not null and lower(btrim(p.given_name)) = $1)
          or ($2::text is not null and lower(btrim(p.family_name)) = $2)
          or ($1::text is not null and exists (
                select 1 from public.person_aliases a
                 where a.person_id = p.id and lower(btrim(a.alias)) = $1))
          or ($2::text is not null and exists (
                select 1 from public.person_aliases a
                 where a.person_id = p.id and lower(btrim(a.alias)) = $2))
          or exists (
               select 1 from public.contact_points c
                where c.person_id = p.id and c.kind = 'email'
                  and lower(btrim(c.raw_value)) in (select email from wanted_emails))
          or exists (
               select 1 from public.contact_points c
                where c.person_id = p.id and c.kind = 'phone'
                  and nullif(right(regexp_replace(c.raw_value, '\\D', '', 'g'), 9), '')
                      in (select phone_tail from wanted_phones))
        )
      order by p.family_name nulls last, p.given_name, p.id`,
      [
        givenName,
        familyName,
        emails,
        phones.map((phone) => phone.replace(/\D/g, "").slice(-9)).filter((tail) => tail !== ""),
      ],
    );

    const contactsByPerson = await readCurrentContacts(
      tx,
      result.rows.map((row) => row.person_id),
    );

    return result.rows.map((row) => {
      const contacts = contactsByPerson.get(row.person_id) ?? { emails: [], phones: [] };
      return {
        personId: row.person_id,
        givenName: row.given_name,
        familyName: row.family_name,
        displayAlias: row.display_alias,
        displayName: displayNameFrom(row.given_name, row.family_name, row.display_alias),
        currentEmails: contacts.emails,
        currentPhones: contacts.phones,
        matchedOn: matchedOnFrom(row),
      };
    });
  });
}

export interface PersonNameAndPhoneMatch {
  readonly personId: string;
}

/**
 * LAN-208. Not `findPersonDuplicates` with a filter — the opposite question,
 * for the anonymous QR sign-up probe. Requires both conditions on the same
 * row, so there is no OR'd flag to misread. Given name only. At most one row.
 */
export async function findPersonMatchingGivenNameAndPhoneIn(
  tx: Tx,
  givenName: string,
  phone: string,
): Promise<PersonNameAndPhoneMatch | null> {
  const normalisedGiven = normaliseTerm(givenName);
  const phoneTail = normaliseTerm(phone)?.replace(/\D/g, "").slice(-9) ?? "";
  if (!normalisedGiven || phoneTail === "") return null;

  const result = await tx.query<{ person_id: string }>(
    `select p.id as person_id
       from public.people p
      where p.merged_into_person_id is null
        and exists (
              select 1 from public.contact_points c
               where c.person_id = p.id and c.kind = 'phone'
                 and nullif(right(regexp_replace(c.raw_value, '\\D', '', 'g'), 9), '') = $2
            )
        and (
              lower(btrim(p.given_name)) = $1
              or exists (
                   select 1 from public.person_aliases a
                    where a.person_id = p.id and lower(btrim(a.alias)) = $1
                 )
            )
      order by p.id
      limit 1`,
    [normalisedGiven, phoneTail],
  );

  const row = result.rows[0];
  return row ? { personId: row.person_id } : null;
}
