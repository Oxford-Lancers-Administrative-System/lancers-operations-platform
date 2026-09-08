import "server-only";

import { ConstraintViolated, NotFound, type Tx, withTransaction } from "@/lib/db";
import { actorRequirement } from "./actor";
import { updatePersonField, type PersonFieldUpdate } from "./person-write";
import type { PersonRecord } from "./person-record";

/**
 * The disputed-fact raise-and-resolve pair — LAN-214, `REQ-no-silent-overwrite`.
 *
 * `person-record.ts`'s own module note says why this did not exist before
 * this package: "There is no contested-value field, no verification-mark
 * field and no confidence class anywhere below — not struck out, never
 * added" (`REQ-no-disputed`). `W5` raises a dispute when a player's answer
 * differs from an operator-recorded value; `W7` settles it. Neither
 * workflow's own screen is this package's — this module is the mechanism
 * both call through.
 *
 * ## Scope: exactly the seven fields that can silently overwrite today
 *
 * `person-write.ts`'s `updatePersonField` overwrites `given_name`,
 * `family_name`, `college`, `matriculation_year`, `expected_graduation_year`,
 * `degree_field` and `date_of_birth` in place — `PersonFieldUpdate`'s own
 * union. That is exactly the set `REQ-no-silent-overwrite` is about. Contact
 * values are deliberately out of scope: `supersedeContactPoint` already dates
 * the old value and inserts a new one rather than overwriting, so nothing
 * there silently overwrites and a dispute table over it would solve nothing.
 *
 * ## "The newer answer supersedes the waiting one"
 *
 * W7's own exceptions-and-recovery note. Enforced structurally by
 * `person_fact_disputes_one_open_per_field`: at most one *open* dispute per
 * (person, field), so {@link raisePersonFactDisputeIn} upserts the open row
 * rather than inserting a second one beside it.
 *
 * ## Resolution actually moves the field
 *
 * "One value stands, the other is retained" (W7's acceptance) is only true
 * of the record itself if resolving to the player's answer actually writes
 * it. `resolvePersonFactDisputeIn` calls `updatePersonField` for exactly that
 * — reusing the one write path this codebase already has for these seven
 * columns rather than a second copy of its column whitelist and its
 * `given_name`-must-not-be-blank rule.
 */

export type DisputedPersonField = PersonFieldUpdate["field"];

export type PersonFactDisputeStatus = "open" | "resolved_kept_club" | "resolved_took_player";

export interface PersonFactDispute {
  id: string;
  personId: string;
  field: DisputedPersonField;
  clubValue: string | null;
  playerValue: string;
  raisedByPersonId: string | null;
  raisedAt: Date;
  status: PersonFactDisputeStatus;
  resolutionNote: string | null;
  resolvedByPersonId: string | null;
  resolvedAt: Date | null;
}

interface DisputeRow {
  id: string;
  person_id: string;
  field: DisputedPersonField;
  club_value: string | null;
  player_value: string;
  raised_by_person_id: string | null;
  raised_at: Date;
  status: PersonFactDisputeStatus;
  resolution_note: string | null;
  resolved_by_person_id: string | null;
  resolved_at: Date | null;
}

function toDispute(row: DisputeRow): PersonFactDispute {
  return {
    id: row.id,
    personId: row.person_id,
    field: row.field,
    clubValue: row.club_value,
    playerValue: row.player_value,
    raisedByPersonId: row.raised_by_person_id,
    raisedAt: row.raised_at,
    status: row.status,
    resolutionNote: row.resolution_note,
    resolvedByPersonId: row.resolved_by_person_id,
    resolvedAt: row.resolved_at,
  };
}

function optional(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Raises a dispute, or — where one is already open for this (person, field)
 * — supersedes its waiting answer with the newer one. Never touches
 * `people`: the club's value stays exactly what it was until an operator
 * resolves the dispute.
 */
export async function raisePersonFactDisputeIn(
  tx: Tx,
  params: {
    personId: string;
    field: DisputedPersonField;
    clubValue: string | null;
    playerValue: string;
    raisedByPersonId?: string | null;
  },
): Promise<PersonFactDispute> {
  const playerValue = params.playerValue.trim();
  if (playerValue === "") {
    throw new ConstraintViolated("A disputed answer cannot be blank.", {
      rule: "person_fact_disputes_player_value_not_blank",
    });
  }

  const result = await tx.query<DisputeRow>(
    `insert into public.person_fact_disputes
       (person_id, field, club_value, player_value, raised_by_person_id)
     values ($1::uuid, $2, $3, $4, $5::uuid)
     on conflict (person_id, field) where status = 'open'
     do update set
       club_value = excluded.club_value,
       player_value = excluded.player_value,
       raised_by_person_id = excluded.raised_by_person_id,
       raised_at = now()
     returning id, person_id, field, club_value, player_value, raised_by_person_id,
               raised_at, status::text as status, resolution_note,
               resolved_by_person_id, resolved_at`,
    [
      params.personId,
      params.field,
      params.clubValue,
      playerValue,
      optional(params.raisedByPersonId),
    ],
  );
  return toDispute(result.rows[0] as unknown as DisputeRow);
}

/** Convenience wrapper for a caller with no open transaction. */
export async function raisePersonFactDispute(
  params: Parameters<typeof raisePersonFactDisputeIn>[1],
): Promise<PersonFactDispute> {
  return withTransaction((tx) => raisePersonFactDisputeIn(tx, params));
}

const requireActor = actorRequirement(
  "Resolving a disputed fact has to name the four-role operator who decided.",
);

/**
 * Builds `updatePersonField`'s own discriminated-union argument for one
 * disputed field. A `switch` over the literal field name, not a generic
 * spread — `PersonFieldUpdate` is a discriminated union precisely so a caller
 * cannot construct a `{ field: "matriculation_year", value: "a string" }`
 * that type-checks, and this is the one place a disputed row's stored text
 * has to become that union again.
 */
function updateFor(
  field: DisputedPersonField,
  text: string,
  common: { actorPersonId: string; personId: string; reason: string },
): Parameters<typeof updatePersonField>[0] {
  switch (field) {
    case "given_name":
      return { ...common, field, value: text };
    case "family_name":
      return { ...common, field, value: text };
    case "college":
      return { ...common, field, value: text };
    case "degree_field":
      return { ...common, field, value: text };
    case "date_of_birth":
      return { ...common, field, value: text };
    case "matriculation_year": {
      const parsed = Number(text);
      return { ...common, field, value: Number.isFinite(parsed) ? parsed : null };
    }
    case "expected_graduation_year": {
      const parsed = Number(text);
      return { ...common, field, value: Number.isFinite(parsed) ? parsed : null };
    }
  }
}

export interface ResolvePersonFactDisputeResult {
  dispute: PersonFactDispute;
  /** The person record, re-read after the write — `null` when the club's value was kept, since nothing on `people` changed. */
  personRecord: PersonRecord | null;
}

/**
 * Settles one open dispute — `W7`'s "keep the club's value, or take the
 * player's." `resolution: "take_player"` writes the player's value onto
 * `people` through `updatePersonField`, in the same transaction as the
 * dispute's own resolution; `"keep_club"` writes nothing to `people` at all,
 * because the club's value already is what it was.
 *
 * The losing value is never deleted — it stays on this same row, in
 * whichever of `clubValue`/`playerValue` did not win, permanently.
 */
export async function resolvePersonFactDisputeIn(
  tx: Tx,
  params: {
    disputeId: string;
    resolverPersonId: string;
    resolution: "keep_club" | "take_player";
    note?: string | null;
  },
): Promise<ResolvePersonFactDisputeResult> {
  const { disputeId, resolverPersonId } = params;
  requireActor(resolverPersonId);
  const note = optional(params.note);

  const existing = await tx.query<DisputeRow>(
    `select id, person_id, field, club_value, player_value, raised_by_person_id,
            raised_at, status::text as status, resolution_note,
            resolved_by_person_id, resolved_at
       from public.person_fact_disputes
      where id = $1::uuid
      for update`,
    [disputeId],
  );
  const row = existing.rows[0];
  if (!row) {
    throw new NotFound("That disputed fact is not on record.", {
      rule: "person_fact_disputes_not_found",
    });
  }
  if (row.status !== "open") {
    throw new ConstraintViolated("This dispute was already resolved.", {
      rule: "person_fact_dispute_already_resolved",
    });
  }

  const toStatus: PersonFactDisputeStatus =
    params.resolution === "take_player" ? "resolved_took_player" : "resolved_kept_club";

  const updated = await tx.query<DisputeRow>(
    `update public.person_fact_disputes
        set status = $2::public.person_fact_dispute_status,
            resolution_note = $3,
            resolved_by_person_id = $4::uuid,
            resolved_at = now()
      where id = $1::uuid
      returning id, person_id, field, club_value, player_value, raised_by_person_id,
                raised_at, status::text as status, resolution_note,
                resolved_by_person_id, resolved_at`,
    [disputeId, toStatus, note, resolverPersonId],
  );
  const dispute = toDispute(updated.rows[0] as unknown as DisputeRow);

  if (params.resolution === "keep_club") {
    return { dispute, personRecord: null };
  }

  const record = await updatePersonField(
    updateFor(row.field, row.player_value, {
      actorPersonId: resolverPersonId,
      personId: row.person_id,
      reason: note ?? `Disputed fact resolved in the player's favour (dispute ${dispute.id}).`,
    }),
  );
  return { dispute, personRecord: record };
}

/** Convenience wrapper for a caller with no open transaction. */
export async function resolvePersonFactDispute(
  params: Parameters<typeof resolvePersonFactDisputeIn>[1],
): Promise<ResolvePersonFactDisputeResult> {
  return withTransaction((tx) => resolvePersonFactDisputeIn(tx, params));
}

/** Every open dispute for one person — what `W7`'s surface lists to resolve. */
export async function readOpenPersonFactDisputesIn(
  tx: Tx,
  personId: string,
): Promise<PersonFactDispute[]> {
  const result = await tx.query<DisputeRow>(
    `select id, person_id, field, club_value, player_value, raised_by_person_id,
            raised_at, status::text as status, resolution_note,
            resolved_by_person_id, resolved_at
       from public.person_fact_disputes
      where person_id = $1::uuid and status = 'open'
      order by raised_at`,
    [personId],
  );
  return result.rows.map((r) => toDispute(r as unknown as DisputeRow));
}

/**
 * One dispute, with the flag and the confirmation each named —
 * `WP-operator-record` (LAN-217), `W7`'s "flag, correction and confirmation
 * stay separately attributable". `raisedByName` is the player who flagged it
 * (`raisedByPersonId`); `resolvedByName` is the four-role operator who
 * resolved it (`resolvedByPersonId`), present only once it has been. The
 * correction itself — the value actually changing on `people` — is already
 * attributable through `updatePersonField`'s own `person_<field>_updated`
 * audit row, read back by `person-record.ts`'s `Q-13` derivation; this is the
 * one thing that path cannot show, because "keep the club's value" writes
 * nothing to `people` at all.
 */
export interface PersonFactDisputeDisplay extends PersonFactDispute {
  raisedByName: string | null;
  resolvedByName: string | null;
}

/**
 * The most recent dispute for each field this person has ever had one on,
 * open or resolved — one row per field, `distinct on`. `W7-02`'s approved
 * screen keeps the losing value visible on the record after resolution, not
 * only in the general history; this is what that rendering reads.
 */
export async function readLatestPersonFactDisputesIn(
  tx: Tx,
  personId: string,
): Promise<PersonFactDisputeDisplay[]> {
  const result = await tx.query<
    DisputeRow & { raised_by_name: string | null; resolved_by_name: string | null }
  >(
    `select distinct on (d.field)
            d.id, d.person_id, d.field, d.club_value, d.player_value,
            d.raised_by_person_id, d.raised_at, d.status::text as status,
            d.resolution_note, d.resolved_by_person_id, d.resolved_at,
            r.given_name || coalesce(' ' || r.family_name, '') as raised_by_name,
            v.given_name || coalesce(' ' || v.family_name, '') as resolved_by_name
       from public.person_fact_disputes d
       left join public.people r on r.id = d.raised_by_person_id
       left join public.people v on v.id = d.resolved_by_person_id
      where d.person_id = $1::uuid
      order by d.field, d.raised_at desc`,
    [personId],
  );
  return result.rows.map((row) => ({
    ...toDispute(row as unknown as DisputeRow),
    raisedByName: row.raised_by_name,
    resolvedByName: row.resolved_by_name,
  }));
}

/** Convenience wrapper for a caller with no open transaction. */
export async function readLatestPersonFactDisputes(
  personId: string,
): Promise<PersonFactDisputeDisplay[]> {
  return withTransaction((tx) => readLatestPersonFactDisputesIn(tx, personId));
}
