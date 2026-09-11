import { readSinkRecords } from "./count.mjs";
import { readPanelState, effectivePersonSettings } from "./panel-state.mjs";
import path from "node:path";
import fs from "node:fs";

export function jobKind(row) {
  const key = row.idempotency_key ?? "";
  if (key.startsWith("onboarding-chase-escalation:")) return "onboarding_chase_escalation";
  if (key.startsWith("onboarding-chase:") || key.startsWith("onboarding-nudge:"))
    return "onboarding_chase";
  if (key.startsWith("onboarding-welcome:")) return "onboarding_welcome";
  if (key.startsWith("recruit-cycle:"))
    return key.split(":").find((part) => part.startsWith("recruit_")) ?? "recruit_cycle";
  return row.job_type === "cancellation_notice"
    ? (row.template_variables?.kind ?? "cancellation")
    : row.job_type;
}
export function observedStatus(job, capture, now) {
  if (capture && capture.transport !== "real")
    return job.outcome === "delivered" ? "simulated_delivered" : "captured";
  if (job.outcome === "delivered") return "delivered_evidence";
  if (job.status === "cancelled") return "cancelled";
  if (job.failure_reason || job.status === "failed") return "failed";
  if (job.accepted_at) return "accepted";
  if (job.status === "processing") return "processing";
  if (job.status === "sent") return "sent";
  return Date.parse(job.next_attempt_at ?? job.scheduled_for ?? job.created_at) <= now
    ? "due"
    : "pending";
}
export async function snapshot(
  db,
  directory,
  { personId = null, eventId = null, limit = 200, now = Date.now() } = {},
) {
  const state = readPanelState(directory);
  const testNow = state.clock ? Date.parse(state.clock) : now;
  const people = (
    await db.query(`select p.id, concat_ws(' ',p.given_name,p.family_name) as name,
 (select coalesce(c.normalised_value,c.raw_value) from contact_points c where c.person_id=p.id and c.kind='phone' and c.valid_until is null order by c.is_preferred desc,c.created_at desc limit 1) as phone
 from people p where p.merged_into_person_id is null order by p.given_name,p.family_name,p.id`)
  ).rows;
  const events = (
    await db.query(
      "select id,name,status,starts_at,scheduled_on from events order by scheduled_on desc,id",
    )
  ).rows;
  const result = await db.query(
    `select j.id,j.idempotency_key,j.job_type,j.status,j.person_id,j.event_id,j.channel,j.scheduled_for,j.created_at,j.next_attempt_at,j.last_error,j.cancelled_reason,j.template_variables,
 a.provider_message_id,a.requested_at,a.accepted_at,a.failure_reason,r.outcome,r.occurred_at,
 count(*) over()::int as total
 from notification_jobs j
 left join lateral(select * from delivery_attempts a where a.notification_job_id=j.id order by a.attempt_number desc limit 1) a on true
 left join lateral(select outcome,occurred_at from delivery_results r where r.notification_job_id=j.id order by r.attempt_number desc limit 1) r on true
 where ($1::uuid is null or j.person_id=$1) and ($2::uuid is null or j.event_id=$2)
 order by (a.requested_at is not null) desc, coalesce(a.requested_at,j.created_at) desc,j.id limit $3`,
    [personId, eventId, limit],
  );
  const records = readSinkRecords(path.join(directory, "delivery-sink"));
  const evidenceDir = path.join(directory, "transport-evidence");
  const evidence = fs.existsSync(evidenceDir)
    ? fs
        .readdirSync(evidenceDir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => JSON.parse(fs.readFileSync(path.join(evidenceDir, f), "utf8")))
    : [];
  const captures = new Map(
    [...records, ...evidence.filter((r) => r.providerMessageId)].map((r) => [
      r.providerMessageId,
      { ...r, kind: r.kind && r.kind !== "unknown" ? r.kind : undefined },
    ]),
  );
  const jobs = result.rows.map((job) => {
    const capture = captures.get(job.provider_message_id);
    const person = people.find((p) => p.id === job.person_id);
    return {
      ...job,
      total: undefined,
      kind: capture?.kind ?? jobKind(job),
      person: person?.name ?? "Person not linked",
      destination: capture?.recipient ?? person?.phone ?? null,
      sender: capture?.payload?.From ?? null,
      identity:
        capture?.identity ??
        effectivePersonSettings(state.people[job.person_id], person ?? { phone: null }).identity,
      observed: observedStatus(job, capture, testNow),
      capture: capture ?? null,
      transport: capture ? (capture.transport ?? "intercepted") : "not_recorded",
      event: events.find((e) => e.id === job.event_id)?.name ?? null,
    };
  });
  return {
    asOf: new Date(now).toISOString(),
    people: people.map((p) => ({ ...p, settings: effectivePersonSettings(state.people[p.id], p) })),
    events,
    jobs,
    total: result.rows[0]?.total ?? 0,
    capturedCount: records.length,
    clock: state.clock,
  };
}
