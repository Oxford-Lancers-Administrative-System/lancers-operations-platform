import "server-only";

import { ConstraintViolated, type Tx, withTransaction } from "@/lib/db";

/**
 * The sectioned per-player activity log — LAN-214, `REQ-activity-log`.
 *
 * `OD7-log-by-section` (Brian, 2026-09-01) and its 2026-09-02 correction of
 * the first counted draft: "I want to see the individual items that come
 * underneath, when it was asked versus when it was received." One row per
 * ask, one row per answer — never a count — grouped by section, each
 * carrying when, how and who.
 *
 * ## Append-only
 *
 * `public.onboarding_activity_log`'s grant is `select, insert` — no `update`,
 * no `delete`. This module exposes no way to change or remove a row once
 * written; there is nothing to call. `onboarding-activity-log.test.ts` proves
 * the database itself refuses both.
 *
 * ## Who writes here
 *
 * `onboarding-welcome.ts`'s welcome emitter writes the mission's first entry
 * — one `ask` per membership. The four later, visual packages write every
 * other ask (a follow-up, an operator nudge, a targeted ask) and every answer
 * (a form step saved, a claim, a document agreed) through
 * {@link recordOnboardingActivityIn}, so every one of them counts against the
 * same table and the same section vocabulary rather than each inventing its
 * own.
 */

export type OnboardingActivityKind = "ask" | "answer";

export interface OnboardingActivityEntry {
  id: string;
  seasonMembershipId: string;
  seasonId: string;
  section: string;
  kind: OnboardingActivityKind;
  /** How — free text ("whatsapp", "email", "operator nudge", "link", "in person"). Never blank. */
  channel: string;
  actorPersonId: string | null;
  /** Who, in words, when there is no person id — an automated chase has nobody behind it. */
  actorLabel: string | null;
  occurredAt: Date;
}

interface ActivityRow {
  id: string;
  season_membership_id: string;
  season_id: string;
  section: string;
  kind: OnboardingActivityKind;
  channel: string;
  actor_person_id: string | null;
  actor_label: string | null;
  occurred_at: Date;
}

function toEntry(row: ActivityRow): OnboardingActivityEntry {
  return {
    id: row.id,
    seasonMembershipId: row.season_membership_id,
    seasonId: row.season_id,
    section: row.section,
    kind: row.kind,
    channel: row.channel,
    actorPersonId: row.actor_person_id,
    actorLabel: row.actor_label,
    occurredAt: row.occurred_at,
  };
}

function optional(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Appends one entry. `kind: "answer"` needs a name for who answered —
 * `actorPersonId` where the player's identity is known, `actorLabel`
 * otherwise — and the database's own `onboarding_activity_log_answer_names_someone`
 * check refuses a nameless one; this function refuses it first, with the
 * club's sentence rather than an integrity error.
 */
export async function recordOnboardingActivityIn(
  tx: Tx,
  params: {
    membershipId: string;
    seasonId: string;
    section: string;
    kind: OnboardingActivityKind;
    channel: string;
    actorPersonId?: string | null;
    actorLabel?: string | null;
    occurredAt?: Date;
  },
): Promise<OnboardingActivityEntry> {
  const section = optional(params.section);
  const channel = optional(params.channel);
  const actorPersonId = optional(params.actorPersonId);
  const actorLabel = optional(params.actorLabel);

  if (section === null) {
    throw new ConstraintViolated("An activity-log entry has to name its section.", {
      rule: "onboarding_activity_log_section_not_blank",
    });
  }
  if (channel === null) {
    throw new ConstraintViolated("An activity-log entry has to say how it happened.", {
      rule: "onboarding_activity_log_channel_not_blank",
    });
  }
  if (params.kind === "answer" && actorPersonId === null && actorLabel === null) {
    throw new ConstraintViolated("An answer has to name who gave it.", {
      rule: "onboarding_activity_log_answer_names_someone",
    });
  }

  const result = await tx.query<ActivityRow>(
    `insert into public.onboarding_activity_log
       (season_membership_id, season_id, section, kind, channel,
        actor_person_id, actor_label, occurred_at)
     values ($1::uuid, $2::uuid, $3, $4::public.onboarding_activity_kind, $5,
             $6::uuid, $7, coalesce($8::timestamptz, now()))
     returning id, season_membership_id, season_id, section,
               kind::text as kind, channel, actor_person_id, actor_label, occurred_at`,
    [
      params.membershipId,
      params.seasonId,
      section,
      params.kind,
      channel,
      actorPersonId,
      actorLabel,
      params.occurredAt ?? null,
    ],
  );
  return toEntry(result.rows[0] as unknown as ActivityRow);
}

/** Convenience wrapper for a caller with no open transaction. */
export async function recordOnboardingActivity(
  params: Parameters<typeof recordOnboardingActivityIn>[1],
): Promise<OnboardingActivityEntry> {
  return withTransaction((tx) => recordOnboardingActivityIn(tx, params));
}

/**
 * One membership's whole log, oldest first within each section — the shape
 * `readOnboardingActivityLogBySectionIn` groups for the record; this is the
 * flat read underneath it, for a caller that wants the entries themselves
 * (a test, an export) rather than the grouping.
 */
export async function readOnboardingActivityLogIn(
  tx: Tx,
  membershipId: string,
): Promise<OnboardingActivityEntry[]> {
  const result = await tx.query<ActivityRow>(
    `select id, season_membership_id, season_id, section,
            kind::text as kind, channel, actor_person_id, actor_label, occurred_at
       from public.onboarding_activity_log
      where season_membership_id = $1::uuid
      order by section, occurred_at asc`,
    [membershipId],
  );
  return result.rows.map((row) => toEntry(row as unknown as ActivityRow));
}

/** `OD7-log-by-section`: the same entries, grouped by section in first-seen order. */
export async function readOnboardingActivityLogBySectionIn(
  tx: Tx,
  membershipId: string,
): Promise<{ section: string; entries: OnboardingActivityEntry[] }[]> {
  const flat = await readOnboardingActivityLogIn(tx, membershipId);
  const bySection = new Map<string, OnboardingActivityEntry[]>();
  for (const entry of flat) {
    const bucket = bySection.get(entry.section);
    if (bucket) bucket.push(entry);
    else bySection.set(entry.section, [entry]);
  }
  return Array.from(bySection.entries()).map(([section, entries]) => ({ section, entries }));
}
