/**
 * The audit trail behind everything the plan writes — LAN-221.
 *
 * Every row names Brian's adopted Person as the actor, or a mechanism label
 * where the application itself would have acted. That is deliberate: rollback
 * keeps audit history (it is history), and an audit row can only survive the
 * deletion of everything it describes if its one foreign key — the actor —
 * points at somebody who is never deleted. `entity_id` carries no foreign key.
 *
 * The action vocabulary is the application's own, so the history screens that
 * read it — the person record's provenance captions, the operator audit tab,
 * the transition ledger — render these rows exactly as they render real ones.
 */

import { id } from "../ids.mjs";

export function buildAudit(ctx, reference, people, recruitment, calendar) {
  const { add, labels, at } = ctx;
  const { actorPersonId, seasonId } = reference;

  const audit = (key, columns, states = []) =>
    add(
      "public.audit_events",
      {
        id: id("audit_events", key),
        actor_person_id: columns.actor_label ? null : actorPersonId,
        actor_label: columns.actor_label ?? null,
        action: columns.action,
        entity_table: columns.entity_table,
        entity_id: columns.entity_id,
        from_state: columns.from_state ?? null,
        to_state: columns.to_state ?? null,
        reason: columns.reason ?? null,
        context: JSON.stringify({ issue: "LAN-221", ...(columns.context ?? {}) }),
        occurred_at: columns.occurred_at,
      },
      "illustrative",
      { source: `audit: ${columns.action}` },
      ["audit.row", ...states],
    );

  // People: created, corrected, contact superseded, aliases, merged.
  for (const player of people.players) {
    audit(`person_created:${player.key}`, {
      action: "person_created",
      entity_table: "people",
      entity_id: player.personId,
      to_state: "created",
      occurred_at: at(-70, "09:00"),
      context: { via: player.index % 4 === 2 ? "sign-up form" : "returner intake" },
    });
  }
  const corrections = [
    [
      people.players[4],
      "college",
      "Baliol",
      "Balliol",
      "Spelling, confirmed against the college list.",
    ],
    [people.players[33], "date_of_birth", "2004-06-14", null, null],
    [
      people.players[5],
      "degree_field",
      "Physics",
      "Physics and Philosophy",
      "Took the player's own answer.",
    ],
    [people.players[9], "family_name", "Jephcot", "Jephcott", "Mis-keyed at the sign-up table."],
  ];
  for (const [player, field, before, after, reason] of corrections) {
    audit(
      `person_${field}_updated:${player.key}`,
      {
        action: `person_${field}_updated`,
        entity_table: "people",
        entity_id: player.personId,
        from_state: before,
        to_state: after,
        reason,
        occurred_at: at(-24 + (player.index % 5), "10:00"),
        context: { field },
      },
      ["audit.person-corrected"],
    );
  }
  audit(`person_contact_superseded:${people.players[2].key}`, {
    action: "person_contact_superseded",
    entity_table: "people",
    entity_id: people.players[2].personId,
    occurred_at: at(-71, "09:30"),
    context: { kind: "email", scope: "college" },
  });
  audit(`person_alias_added:${people.players[0].key}`, {
    action: "person_alias_added",
    entity_table: "people",
    entity_id: people.players[0].personId,
    to_state: "Al",
    occurred_at: at(-69, "09:00"),
  });
  audit(`person_alias_display_name_set:${people.players[0].key}`, {
    action: "person_alias_display_name_set",
    entity_table: "people",
    entity_id: people.players[0].personId,
    to_state: "Al",
    occurred_at: at(-69, "09:01"),
  });
  audit(
    "person_merged:merged-loser",
    {
      action: "person_merged",
      entity_table: "people",
      entity_id: id("people", "merged-loser"),
      to_state: people.players[6].personId,
      reason: "Entered twice at the Freshers' Fair; same phone number.",
      occurred_at: at(-30, "11:00"),
      context: { survivor_id: people.players[6].personId },
    },
    ["audit.person-merged"],
  );

  // Memberships.
  for (const player of people.players) {
    if (player.status === "onboarding") continue;
    audit(`season_membership_status_changed:${player.key}`, {
      action: "season_membership_status_changed",
      entity_table: "season_memberships",
      entity_id: player.membershipId,
      from_state: "onboarding",
      to_state: player.status === "active" ? "active" : player.status,
      occurred_at: at(-45 + (player.index % 10), "09:00"),
    });
  }

  // Events: drafted, approved, amended, cancelled; the term card imported.
  let imported = 0;
  for (const record of calendar.events) {
    if (record.spec.termCard) {
      imported += 1;
      continue;
    }
    const createdAt = record.spec.createdAt ?? at(-58, "09:00");
    audit(`event.drafted:${record.key}`, {
      action: "event.drafted",
      entity_table: "events",
      entity_id: record.eventId,
      to_state: "draft",
      occurred_at: createdAt,
    });
    if (record.approvedAt) {
      audit(`event.audience_confirmed:${record.key}`, {
        action: "event.audience_confirmed",
        entity_table: "events",
        entity_id: record.eventId,
        occurred_at: record.approvedAt,
        context: { invited: record.invitations.length },
      });
      audit(
        `event.approved:${record.key}`,
        {
          action: "event.approved",
          entity_table: "events",
          entity_id: record.eventId,
          from_state: "draft",
          to_state: "approved",
          occurred_at: record.approvedAt,
          context: { invited: record.invitations.length },
        },
        ["audit.event-approved"],
      );
    }
    if (record.spec.amendment) {
      audit(`event.amended:${record.key}`, {
        action: "event.amended",
        entity_table: "events",
        entity_id: record.eventId,
        occurred_at: record.spec.amendment.at,
        context: {
          notified: record.spec.amendment.notified,
          changed: Object.keys(record.spec.amendment.previous),
        },
      });
    }
    if (record.status === "cancelled") {
      audit(`event.cancelled:${record.key}`, {
        action: "event.cancelled",
        entity_table: "events",
        entity_id: record.eventId,
        from_state: "approved",
        to_state: "cancelled",
        reason: record.spec.decisionReason,
        occurred_at: record.spec.cancelledAt,
      });
    }
  }
  if (imported > 0) {
    audit(
      "event.imported:michaelmas",
      {
        action: "event.imported",
        entity_table: "seasons",
        entity_id: seasonId,
        occurred_at: at(-59, "10:00"),
        context: { created: imported, updated: 0, refused: 0, term: "michaelmas" },
      },
      ["audit.import"],
    );
  }

  // Recruits.
  for (const recruit of recruitment.recruits) {
    if (recruit.door === "hand") {
      audit(`recruitment_prospect.added_by_hand:${recruit.key}`, {
        action: "recruitment_prospect.added_by_hand",
        entity_table: "recruitment_prospects",
        entity_id: recruit.prospectId,
        to_state: "identified",
        occurred_at: at(-40, "12:00"),
      });
    }
    if (
      ["engaged", "committed", "joined", "declined", "disengaged", "void"].includes(recruit.status)
    ) {
      audit(`recruitment_prospect.status_changed:${recruit.key}`, {
        action:
          recruit.status === "joined"
            ? "recruitment_prospect.joined"
            : "recruitment_prospect.status_changed",
        entity_table: "recruitment_prospects",
        entity_id: recruit.prospectId,
        from_state: recruit.status === "joined" ? "committed" : "identified",
        to_state: recruit.status,
        occurred_at: at(-20, "10:00"),
      });
    }
  }

  // Escalations raised.
  for (const job of calendar.jobs.filter((entry) => entry.job_type === "escalation")) {
    audit(`delivery.escalation_raised:${job.event_id}`, {
      action: "delivery.escalation_raised",
      actor_label: "system: messaging scheduler",
      entity_table: "events",
      entity_id: job.event_id,
      occurred_at: job.scheduled_for,
      context: { outstanding: JSON.parse(job.template_variables).outstanding },
    });
  }

  void labels;
}
