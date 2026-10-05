import type { Tx } from "@/lib/db";
import { isOxfordCollegeEmail } from "./person-validation";

/**
 * The email an operator is created with, classified — LAN-462 (Brian,
 * 2026-10-02).
 *
 * Before this, Invite operator stored the address with no classification
 * (`contact_points.scope` null), so the person record showed it as "Email · not
 * classified", and seating a person who had no email stored the login address
 * on the operator account only. The rule:
 *
 *   * The email is always classified. An address `isOxfordCollegeEmail`
 *     accepts is stored as **college email** — for a coach who is not a
 *     student too — and any other address as **personal email**.
 *   * When the person already has a preferred email of that scope, the one
 *     already there stays preferred and this one is kept as a second,
 *     non-preferred address (the unique index
 *     `contact_points_one_preferred_per_kind` allows one preferred row per
 *     `(person, kind, scope)`).
 *   * The same address is never stored twice. If the person already holds it
 *     classified, nothing is written; if they hold it unclassified, that row is
 *     classified in place under the same preference rule.
 *
 * The one-off correction for rows stored before this (LAN-462's owner-run
 * SQL, proved by `tests/email-classification-correction.test.ts`) applies the
 * same rule, and also removes an unclassified row that duplicates an address
 * the person already holds classified.
 *
 * Kept as one function so every door that creates an operator calls the same
 * rule: Invite operator (`operator-invitations/shared.ts`), seating a person
 * (`operator-administration/seat-account.ts`), and LAN-459's onboarding after
 * them.
 */
export type ClassifiedEmailScope = "college" | "personal";

/** College when the Oxford rule accepts the address, personal otherwise. */
export function classifyEmailScope(address: string): ClassifiedEmailScope {
  return isOxfordCollegeEmail(address) ? "college" : "personal";
}

/** What {@link recordClassifiedEmailIn} did. */
export type RecordedEmailOutcome =
  | { readonly kind: "inserted"; readonly scope: ClassifiedEmailScope; readonly preferred: boolean }
  | {
      readonly kind: "classified_in_place";
      readonly scope: ClassifiedEmailScope;
      readonly preferred: boolean;
    }
  | { readonly kind: "already_recorded" };

interface CurrentEmailRow {
  id: string;
  scope: ClassifiedEmailScope | null;
  is_preferred: boolean;
  same_address: boolean;
}

/**
 * Record `address` on the person as a classified email, under the rule above.
 * `source` is the provenance shown beside the value on the record.
 */
export async function recordClassifiedEmailIn(
  tx: Tx,
  input: { readonly personId: string; readonly address: string; readonly source: string },
): Promise<RecordedEmailOutcome> {
  const address = input.address.trim();
  const scope = classifyEmailScope(address);

  const current = await tx.query<CurrentEmailRow>(
    `select id, scope::text as scope, is_preferred,
            lower(btrim(raw_value)) = lower($2::text) as same_address
       from public.contact_points
      where person_id = $1::uuid and kind = 'email' and valid_until is null
      order by is_preferred desc, created_at`,
    [input.personId, address],
  );

  const same = current.rows.filter((row) => row.same_address);
  if (same.some((row) => row.scope !== null)) return { kind: "already_recorded" };

  const preferredTaken = current.rows.some(
    (row) => row.scope === scope && row.is_preferred && !row.same_address,
  );
  const unclassified = same[0];
  if (unclassified) {
    // Classified in place keeps its own preference unless the scope's
    // preferred slot is already taken — the rule the one-off correction uses.
    const preferred = unclassified.is_preferred && !preferredTaken;
    await tx.query(
      `update public.contact_points
          set scope = $2::public.contact_point_scope, is_preferred = $3
        where id = $1::uuid`,
      [unclassified.id, scope, preferred],
    );
    return { kind: "classified_in_place", scope, preferred };
  }

  const preferred = !preferredTaken;
  await tx.query(
    `insert into public.contact_points (person_id, kind, scope, raw_value, is_preferred, source)
     values ($1::uuid, 'email', $2::public.contact_point_scope, $3, $4, $5)`,
    [input.personId, scope, address, preferred, input.source],
  );
  return { kind: "inserted", scope, preferred };
}

/**
 * Copy an operator's login email onto their person when the person has no
 * current email at all — LAN-462's seating rule. Returns `null` when the
 * person already had one, and nothing is written.
 */
export async function recordLoginEmailIfNoneIn(
  tx: Tx,
  input: { readonly personId: string; readonly address: string; readonly source: string },
): Promise<RecordedEmailOutcome | null> {
  const existing = await tx.query(
    `select 1 from public.contact_points
      where person_id = $1::uuid and kind = 'email' and valid_until is null
      limit 1`,
    [input.personId],
  );
  if (existing.rows.length > 0) return null;
  return recordClassifiedEmailIn(tx, input);
}
