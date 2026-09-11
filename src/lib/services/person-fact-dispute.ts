import "server-only";

import { ConstraintViolated, NotFound, type Tx } from "@/lib/db";
import { actorRequirement } from "./actor";
import { updatePersonField, type PersonFieldUpdate } from "./person-write";
import type { PersonRecord } from "./person-record";

/**
 * The disputed-fact raise-and-resolve pair — LAN-214, `REQ-no-silent-overwrite`.
 * `W5` raises a dispute when a player's answer differs from an
 * operator-recorded value; `W7` settles it — this module is the mechanism
 * both call through. Scoped to `PersonFieldUpdate`'s seven overwritable
 * fields; contact values are out of scope (`supersedeContactPoint` already
 * dates and supersedes, never overwrites). At most one *open* dispute per
 * (person, field) — {@link raisePersonFactDisputeIn} upserts rather than
 * inserting a second row. `resolvePersonFactDisputeIn` calls
 * `updatePersonField` to actually move the field, reusing the one write path
 * rather than a second column whitelist.
 */

export type DisputedPersonField = PersonFieldUpdate["field"];

type PersonFactDisputeStatus = "open" | "resolved_kept_club" | "resolved_took_player";

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

/** Raises a dispute, or supersedes an already-open one's waiting answer. Never touches `people` until resolved. */
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

const requireActor = actorRequirement(
  "Resolving a disputed fact has to name the four-role operator who decided.",
);

/** Builds `updatePersonField`'s discriminated-union argument for one field — a `switch`, not a spread, so a mismatched value can't type-check. */
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
    case "student_number":
      return { ...common, field, value: text };
    case "bafa_registration_number":
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
  /** Re-read after the write; `null` when the club's value was kept. */
  personRecord: PersonRecord | null;
}

/** Settles one open dispute (W7). `take_player` writes to `people` via `updatePersonField`, in the same transaction; `keep_club` writes nothing. The losing value stays on the row, permanently. */
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
