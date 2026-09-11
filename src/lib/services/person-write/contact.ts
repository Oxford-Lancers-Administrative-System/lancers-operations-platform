import "server-only";

import { ConstraintViolated, withTransaction } from "@/lib/db";
import { recordAudit } from "../audit";
import { type ContactKind, type ContactScope, type PersonContactValue } from "../person-record";
import { validateEmailAddress, validatePhoneNumber } from "../person-validation";
import { personDisplayNameSql } from "../sql-text";
import {
  assertNoConcurrentPersonChange,
  lockPersonRow,
  optional,
  requireActor,
  requireReasonForChange,
} from "./shared";

/**
 * Contact points — supersede, not overwrite. `REQ-supersede`, LAN-183/LAN-185.
 * See `relocations.md` for the module's two-write-shapes note.
 */

export interface SupersedeContactPointParams {
  actorPersonId: string;
  personId: string;
  kind: ContactKind;
  /** `null` for phone; for email, `"college"`, `"personal"`, or `null` for not-yet-classified. */
  scope?: ContactScope;
  rawValue: string;
  /** Required only when a current preferred value of this kind and scope already exists. */
  reason?: string | null;
  /** Who supplied it — `REQ-no-verification-mark`. Free text, e.g. "operator correction". */
  source?: string | null;
  /** `personVersion()`'s snapshot, from when the edit form loaded. LAN-185, W2-09. */
  expectedVersion?: string | null;
}

export interface SupersedeContactPointResult {
  contact: PersonContactValue;
  supersededContact: PersonContactValue | null;
}

function toContactValue(row: {
  id: string;
  kind: ContactKind;
  scope: ContactScope;
  raw_value: string;
  normalised_value: string | null;
  is_preferred: boolean;
  source: string | null;
  valid_from: Date;
  valid_until: Date | null;
}): PersonContactValue {
  return {
    id: row.id,
    kind: row.kind,
    scope: row.scope,
    rawValue: row.raw_value,
    normalisedValue: row.normalised_value,
    isPreferred: row.is_preferred,
    source: row.source,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
  };
}

/**
 * Replaces the current preferred contact value of one kind/scope, preserving
 * the old one, dated. Filling a kind/scope with no current value needs no
 * reason; replacing one does. Keeps `contact_points_one_preferred_per_kind`
 * true by dating the old row rather than racing it.
 */
export async function supersedeContactPoint(
  params: SupersedeContactPointParams,
): Promise<SupersedeContactPointResult> {
  const { actorPersonId, personId, kind } = params;
  requireActor(actorPersonId);

  const scope = params.scope ?? null;
  if (kind === "phone" && scope !== null) {
    throw new ConstraintViolated("A phone number does not carry a college/personal scope.", {
      rule: "contact_points_scope_is_for_email",
    });
  }

  const validation =
    kind === "email" ? validateEmailAddress(params.rawValue) : validatePhoneNumber(params.rawValue);
  if (!validation.valid) {
    throw new ConstraintViolated(validation.message, { rule: validation.rule });
  }
  const rawValue = params.rawValue.trim();
  const reason = optional(params.reason);
  const source = optional(params.source);

  return withTransaction(async (tx) => {
    await lockPersonRow(tx, personId);
    await assertNoConcurrentPersonChange(tx, personId, params.expectedVersion);

    const current = await tx.query<{
      id: string;
      kind: ContactKind;
      scope: ContactScope;
      raw_value: string;
      normalised_value: string | null;
      is_preferred: boolean;
      source: string | null;
      valid_from: Date;
      valid_until: Date | null;
    }>(
      `select id, kind::text as kind, scope::text as scope, raw_value, normalised_value,
              is_preferred, source, valid_from, valid_until
         from public.contact_points
        where person_id = $1::uuid and kind = $2::public.contact_point_kind
          and scope is not distinct from $3::public.contact_point_scope
          and valid_until is null and is_preferred
        for update`,
      [personId, kind, scope],
    );
    const supersededRow = current.rows[0] ?? null;

    const fieldLabel =
      kind === "email"
        ? scope === "college"
          ? "the college email"
          : scope === "personal"
            ? "the personal email"
            : "the email"
        : "the mobile number";
    requireReasonForChange(supersededRow ? supersededRow.raw_value : null, reason, fieldLabel);

    // LAN-185 W2-07: a shared email is refused; a shared phone is not (a household number is common).
    if (kind === "email") {
      const collision = await tx.query<{ person_id: string; display_name: string }>(
        `select c.person_id, ${personDisplayNameSql("p")} as display_name
           from public.contact_points c
           join public.people p on p.id = c.person_id
          where c.kind = 'email' and c.valid_until is null
            and lower(btrim(c.raw_value)) = lower(btrim($1::text))
            and c.person_id <> $2::uuid
            and p.merged_into_person_id is null
          limit 1`,
        [rawValue, personId],
      );
      const other = collision.rows[0];
      if (other) {
        throw new ConstraintViolated(
          `${other.display_name} already holds this email. Two records sharing a contact point is usually one person twice.`,
          { rule: "person_contact_email_in_use" },
        );
      }
    }

    if (supersededRow) {
      // Both columns, in one statement: the partial unique index carries no valid_until condition, so both must change together.
      await tx.query(
        `update public.contact_points set valid_until = now(), is_preferred = false where id = $1::uuid`,
        [supersededRow.id],
      );
    }

    const inserted = await tx.query<{
      id: string;
      kind: ContactKind;
      scope: ContactScope;
      raw_value: string;
      normalised_value: string | null;
      is_preferred: boolean;
      source: string | null;
      valid_from: Date;
      valid_until: Date | null;
    }>(
      `insert into public.contact_points (person_id, kind, scope, raw_value, is_preferred, source)
       values ($1::uuid, $2::public.contact_point_kind, $3::public.contact_point_scope, $4, true, $5)
       returning id, kind::text as kind, scope::text as scope, raw_value, normalised_value,
                 is_preferred, source, valid_from, valid_until`,
      [personId, kind, scope, rawValue, source],
    );
    const contact = toContactValue(inserted.rows[0]);

    await recordAudit(tx, {
      actorPersonId,
      action: supersededRow ? "person_contact_superseded" : "person_contact_recorded",
      entityTable: "contact_points",
      entityId: contact.id,
      fromState: supersededRow?.raw_value ?? null,
      toState: contact.rawValue,
      reason,
      context: {
        issue: "LAN-183",
        person_id: personId,
        kind,
        scope,
        superseded_contact_id: supersededRow?.id ?? null,
      },
    });

    return {
      contact,
      supersededContact: supersededRow ? toContactValue(supersededRow) : null,
    };
  });
}
