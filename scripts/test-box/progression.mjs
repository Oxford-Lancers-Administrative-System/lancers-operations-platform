import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { runtime } from "./runtime.mjs";
import { readPanelState, effectivePersonSettings } from "./panel-state.mjs";
import { advanceChronologically } from "./clock.mjs";
import { prepareDatabaseClock, setSharedTime } from "./database-clock.mjs";
import { confirmIntercepted } from "./callbacks.mjs";
import { templateNames, testTemplateName } from "./configure.mjs";

export function responsePlans(directory, people) {
  const state = readPanelState(directory);
  const folder = path.join(directory, "transport-evidence");
  const names = templateNames(fs.readFileSync("src/lib/delivery/templates.ts", "utf8"));
  const records = fs.existsSync(folder)
    ? fs
        .readdirSync(folder)
        .filter((f) => f.endsWith(".json"))
        .map((f) => JSON.parse(fs.readFileSync(path.join(folder, f), "utf8")))
    : [];
  const results = path.join(directory, "responses");
  const plans = [];
  for (const record of records) {
    if (
      record.transport !== "intercepted" ||
      !record.personId ||
      !record.providerMessageId ||
      record.simulatedOutcome === "failed"
    )
      continue;
    const person = people.find((p) => p.id === record.personId);
    if (!person) continue;
    const profile = effectivePersonSettings(state.people[person.id], person);
    if (
      profile.identity !== "synthetic" ||
      !["prompt", "late"].includes(profile.responder) ||
      profile.completion === "none" ||
      profile.delivery !== "intercepted"
    )
      continue;
    // Only a simulated delivered message can initiate a simulated response.
    const hash = crypto.createHash("sha256").update(record.providerMessageId).digest("hex");
    if (!fs.existsSync(path.join(directory, "simulated-receipts", hash + ".json"))) continue;
    const kind =
      record.kind ??
      Object.entries(names).find(
        ([, v]) => record.payload?.template?.name === testTemplateName(v),
      )?.[0];
    if (!["invitation", "reminder", "recruit_event_follow_up"].includes(kind)) continue;
    const buttons = record.payload?.template?.components?.filter((c) => c.type === "button") ?? [];
    const token = buttons.find(
      (b) =>
        Number(b.index) ===
        (profile.eventAnswer === "no" &&
        ["invitation", "reminder", "recruit_event_follow_up"].includes(kind)
          ? 1
          : 0),
    )?.parameters?.[0]?.text;
    if (typeof token !== "string") continue;
    const file = path.join(results, hash + ".json");
    const result = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
    const delay = profile.responder === "prompt" ? 1 / 60 : profile.delayHours;
    plans.push({
      id: hash,
      personId: person.id,
      person: person.name,
      kind,
      token,
      file,
      at: new Date(Date.parse(record.testAt ?? record.at) + delay * 3600000).toISOString(),
      result,
      profile: profile.responder,
      completion: profile.completion,
    });
  }
  return plans;
}

export function createProgression(db, directory, domain, readPeople) {
  let busy = false;
  let lastError = null;
  let progress = null;
  async function settle(time) {
    for (let pass = 0; pass < 250; pass++) {
      const active = await runtime();
      const response = await fetch(active.baseUrl + "/api/scheduler/messaging", {
        method: "POST",
        headers: { authorization: "Bearer " + active.env.SCHEDULER_TRIGGER_TOKEN },
        redirect: "error",
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok)
        throw new Error("The local messaging sweep failed. Evidence remains available.");
      const summary = await response.json();
      const confirmed = await confirmIntercepted(db, directory, active);
      const plans = responsePlans(directory, await readPeople());
      let acted = 0;
      for (const plan of plans.filter((p) => !p.result && Date.parse(p.at) <= Date.parse(time))) {
        fs.mkdirSync(path.dirname(plan.file), { recursive: true, mode: 0o700 });
        let result;
        try {
          result = {
            status: "completed",
            ...(await domain.simulateResponse(plan.personId, plan.token, plan.kind)),
          };
        } catch {
          result = {
            status: "failed",
            action:
              "The application refused this simulated form action. Check the person and current form state.",
          };
        }
        fs.writeFileSync(
          plan.file,
          JSON.stringify({
            ...result,
            personId: plan.personId,
            kind: plan.kind,
            testAt: time,
            actualAt: new Date().toISOString(),
          }),
          { mode: 0o600, flag: "wx" },
        );
        acted++;
      }
      progress = {
        time,
        pass: pass + 1,
        dispatched: summary.dispatched ?? 0,
        confirmed,
        responses: acted,
      };
      if (!summary.dispatched && !confirmed && !acted) return;
    }
    throw new Error(
      "The local sweep did not settle within 250 passes. Inspect the remaining jobs.",
    );
  }
  async function nextDue({ current, through }) {
    const rows = (
      await db.query(
        `select min(at) as at from (
    select coalesce(next_attempt_at,scheduled_for,created_at) as at from notification_jobs where status in ('pending','ready') or (status='failed' and next_attempt_at is not null)
    union all select escalation_at as at from event_messaging_plans
  ) due where at>$1::timestamptz and at<=$2::timestamptz`,
        [current, through],
      )
    ).rows;
    const dates = [rows[0]?.at].filter(Boolean).map((d) => new Date(d).getTime());
    for (const c of await domain.onboardingExpectations()) {
      if (c.hasOutstanding && c.hasConsent && c.next.kind === "scheduled")
        dates.push(new Date(c.next.at).getTime());
    }
    for (const p of responsePlans(directory, await readPeople()))
      if (!p.result) dates.push(Date.parse(p.at));
    const eligible = dates.filter((d) => d > Date.parse(current) && d <= Date.parse(through));
    return eligible.length ? new Date(Math.min(...eligible)).toISOString() : null;
  }
  async function run(hours = 0) {
    if (busy) throw new Error("A test run is already in progress.");
    busy = true;
    lastError = null;
    try {
      const current = readPanelState(directory).clock ?? new Date().toISOString();
      if (hours === 0) {
        await settle(current);
        return { time: current };
      }
      await prepareDatabaseClock();
      return await advanceChronologically({
        current,
        hours,
        setTime: setSharedTime,
        settle,
        nextDue,
      });
    } catch (error) {
      lastError = error.message;
      throw error;
    } finally {
      busy = false;
    }
  }
  return { run, status: () => ({ busy, lastError, progress }) };
}
