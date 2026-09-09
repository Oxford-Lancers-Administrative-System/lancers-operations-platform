#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectLocal } from "../lib/local-db.mjs";
import { runtime, isLoopbackApp } from "./runtime.mjs";

export function parseArguments(args) {
  const options = { hours: null, event: null, dryRun: false, realMessages: false };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const argument = args[i];
    if (seen.has(argument)) throw new Error("Duplicate option.");
    seen.add(argument);
    if (argument === "--hours") {
      const value = args[++i];
      if (!/^\d+(\.\d+)?$/.test(value ?? "")) throw new Error("--hours needs a positive number.");
      options.hours = Number(value);
    } else if (argument === "--event") {
      options.event = args[++i];
      if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(options.event ?? "")) {
        throw new Error("--event needs an event UUID.");
      }
    } else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--real-messages") options.realMessages = true;
    else
      throw new Error(
        "Usage: fast-forward.mjs --hours N [--event UUID] [--dry-run] [--real-messages]",
      );
  }
  if (!Number.isFinite(options.hours) || options.hours <= 0 || options.hours > 8760) {
    throw new Error("--hours must be greater than zero and at most 8760.");
  }
  return options;
}

/** Caller owns the transaction. Only unfinished schedules move, never delivery evidence. */
export async function shiftSchedules(db, { hours, event }) {
  await db.query("set local lock_timeout = '2s'");
  await db.query(
    "lock table public.notification_jobs, public.event_messaging_plans in exclusive mode nowait",
  );
  const active = await db.query(
    "select count(*)::int as count from public.notification_jobs where status = 'processing' and ($1::uuid is null or event_id = $1)",
    [event],
  );
  if (active.rows[0].count)
    throw new Error(
      "A selected job is processing. Stop the ticker and let in-flight sends finish.",
    );
  if (event) {
    const exists = await db.query("select 1 from public.events where id = $1", [event]);
    if (!exists.rowCount) throw new Error("Selected event does not exist.");
  }
  const jobs = await db.query(
    `update public.notification_jobs
        set scheduled_for = scheduled_for - ($1::double precision * interval '1 hour'),
            next_attempt_at = next_attempt_at - ($1::double precision * interval '1 hour')
      where status in ('pending', 'ready', 'failed')
        and ($2::uuid is null or event_id = $2)
        and (scheduled_for is not null or next_attempt_at is not null)
      returning id, event_id, scheduled_for, next_attempt_at`,
    [hours, event],
  );
  // The frozen plan stores its rung anchors as columns, not as JSON. Moving
  // them together preserves relative order and escalation constraints. The
  // response deadline, event dates and actual delivery timestamps stay fixed.
  const plans = await db.query(
    `update public.event_messaging_plans p
        set invitation_at = invitation_at - ($1::double precision * interval '1 hour'),
            escalation_at = escalation_at - ($1::double precision * interval '1 hour'),
            recruit_invitation_at = recruit_invitation_at - ($1::double precision * interval '1 hour'),
            recruit_follow_up_at = recruit_follow_up_at - ($1::double precision * interval '1 hour')
      where ($2::uuid is null or event_id = $2)
        and exists (select 1 from public.events e where e.id = p.event_id and e.status = 'approved')
      returning event_id`,
    [hours, event],
  );
  return { jobs: jobs.rows, plans: plans.rows };
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  const { env, databaseUrl, baseUrl } = await runtime();
  if (!options.dryRun) {
    if (!env.SCHEDULER_TRIGGER_TOKEN?.trim())
      throw new Error("Configure the local scheduler token first.");
    if (!isLoopbackApp(env.APP_BASE_URL) && !options.realMessages) {
      throw new Error(
        "This app may send real messages. Use --real-messages only for an owner-authorized phone test.",
      );
    }
    const health = await fetch(`${baseUrl}/api/health`, {
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!health.ok) throw new Error("Local app health check failed; no schedules moved.");
  }
  const db = await connectLocal(databaseUrl);
  let result;
  try {
    await db.query("begin");
    result = await shiftSchedules(db, options);
    await db.query(options.dryRun ? "rollback" : "commit");
  } catch (error) {
    await db.query("rollback");
    if (error.code)
      throw new Error(
        "Local schedule update refused; transaction rolled back. Check for concurrent work or schema mismatch.",
      );
    throw error;
  } finally {
    await db.end();
  }
  console.log(
    `${options.dryRun ? "Dry run: would move" : "Moved"} ${result.jobs.length} unfinished jobs and ${result.plans.length} frozen plans back ${options.hours} hours.`,
  );
  for (const row of result.jobs) console.log(JSON.stringify(row));
  if (options.dryRun) return;
  try {
    const response = await fetch(`${baseUrl}/api/scheduler/messaging`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.SCHEDULER_TRIGGER_TOKEN}` },
      redirect: "error",
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error("Sweep refused.");
    const summary = await response.json();
    const counts = Object.fromEntries(
      Object.entries(summary).filter(([, value]) => typeof value === "number"),
    );
    console.log("One sweep completed:", JSON.stringify(counts));
  } catch {
    throw new Error(
      "Schedules were committed, but the sweep did not confirm completion. Do not repeat fast-forward: inspect delivery and run the ticker to resume.",
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
