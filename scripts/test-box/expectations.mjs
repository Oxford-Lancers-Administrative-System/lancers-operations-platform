/** Independent of job creation: reconstruct event rungs from the frozen approval plan. */
export function plannedRungs(invitation) {
  const recruit = invitation.capacity === "recruit";
  const anchor = recruit ? invitation.recruit_invitation_at : invitation.invitation_at;
  if (!anchor) return [];
  const rows = [
    { kind: "invitation", rung: 0, at: new Date(anchor).toISOString(), channel: "whatsapp" },
  ];
  if (recruit) {
    if (invitation.recruit_follow_up_at)
      rows.push({
        kind: "recruit_event_follow_up",
        rung: 1,
        at: new Date(invitation.recruit_follow_up_at).toISOString(),
        channel: "whatsapp",
      });
  } else {
    const count = invitation.whatsapp_reminders_scheduled + invitation.email_reminders_scheduled;
    for (let rung = 1; rung <= count; rung++)
      rows.push({
        kind: "reminder",
        rung,
        at: new Date(
          Date.parse(anchor) + rung * invitation.reminder_cadence_hours * 3600000,
        ).toISOString(),
        channel: rung <= invitation.whatsapp_reminders_scheduled ? "whatsapp" : "email",
      });
  }
  return rows;
}
export function compareExpectation(expected, actual, now) {
  if (actual?.accepted_at) {
    if (
      expected.withheldSince &&
      Date.parse(actual.accepted_at) >= Date.parse(expected.withheldSince)
    )
      return "unexpected";
    return "observed";
  }
  if (expected.withheldSince)
    return actual?.status === "cancelled" ? "correctly_withheld" : "withholding_expected";
  if (actual?.failure_reason || actual?.status === "failed") return "failed";
  if (Date.parse(expected.at) > now) return "not_due";
  if (!actual) return "missing";
  return "due_not_sent";
}
export async function expectations(db, { personId, eventId, now }) {
  const invitations = (
    await db.query(
      `select i.id,i.capacity,coalesce(i.person_id,m.person_id) as person_id,i.event_id,
  p.invitation_at,p.reminder_cadence_hours,p.whatsapp_reminders_scheduled,p.email_reminders_scheduled,p.recruit_invitation_at,p.recruit_follow_up_at,
  (select min(responded_at) from rsvp_responses r where r.invitation_id=i.id) as responded_at,
  e.name as event_name,e.status as event_status
  from invitations i join event_messaging_plans p on p.event_id=i.event_id join events e on e.id=i.event_id
  left join season_memberships m on m.id=i.season_membership_id
  where ($1::uuid is null or coalesce(i.person_id,m.person_id)=$1) and ($2::uuid is null or i.event_id=$2)`,
      [personId, eventId],
    )
  ).rows;
  const jobs = (
    await db.query(
      `select j.id,j.invitation_id,j.ladder_rung,j.job_type,j.status,j.scheduled_for,a.accepted_at,a.failure_reason from notification_jobs j
  left join lateral(select accepted_at,failure_reason from delivery_attempts where notification_job_id=j.id order by attempt_number desc limit 1) a on true
  where ($1::uuid is null or j.person_id=$1) and ($2::uuid is null or j.event_id=$2)`,
      [personId, eventId],
    )
  ).rows;
  const byKey = new Map(
    jobs
      .filter((j) => j.invitation_id)
      .map((j) => [`${j.invitation_id}:${j.job_type}:${j.ladder_rung ?? 0}`, j]),
  );
  const rows = [];
  for (const invitation of invitations)
    for (const rung of plannedRungs(invitation)) {
      const actual = byKey.get(
        `${invitation.id}:${rung.rung === 0 ? "invitation" : "reminder"}:${rung.rung}`,
      );
      const expected = {
        ...rung,
        personId: invitation.person_id,
        eventId: invitation.event_id,
        event: invitation.event_name,
        withheldSince: rung.rung > 0 ? invitation.responded_at : null,
      };
      const status =
        invitation.event_status === "cancelled" && !actual?.accepted_at
          ? "withholding_expected"
          : compareExpectation(expected, actual, now);
      rows.push({
        ...expected,
        id: invitation.id + ":" + rung.rung,
        jobId: actual?.id ?? null,
        status,
        reason:
          rung.rung === 0
            ? "Invitation anchor frozen at approval"
            : expected.withheldSince
              ? "An RSVP stops subsequent reminders"
              : `Frozen reminder cadence: rung ${rung.rung}`,
      });
    }
  const counts = rows.reduce((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {});
  // Failures and missing work first; do not hide them behind far-future seed rows.
  const rank = {
    unexpected: 0,
    missing: 1,
    failed: 2,
    due_not_sent: 3,
    withholding_expected: 4,
    not_due: 5,
    observed: 6,
    correctly_withheld: 7,
  };
  rows.sort((a, b) => rank[a.status] - rank[b.status] || Date.parse(a.at) - Date.parse(b.at));
  return {
    rows: rows.slice(0, 200),
    counts,
    total: rows.length,
    scope:
      "Event invitation and reminder timing from frozen approval plans. Other workflow coverage is shown separately; no untested workflow is marked passed.",
  };
}
