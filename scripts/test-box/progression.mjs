import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { runtime } from "./runtime.mjs";
import { readPanelState, effectivePersonSettings } from "./panel-state.mjs";
import { advanceChronologically } from "./clock.mjs";
import { prepareDatabaseClock, setSharedTime } from "./database-clock.mjs";
import { confirmIntercepted } from "./callbacks.mjs";
import { templateNames, testTemplateName } from "./configure.mjs";

/** The three player-facing rungs a simulated person may answer. LAN-297. */
const ANSWERABLE_KINDS = ["invitation", "reminder", "recruit_event_follow_up"];
/** The reminder rung in either ladder: the only capture a change of answer follows. */
const REMINDER_KINDS = ["reminder", "recruit_event_follow_up"];
/**
 * `y.<invitationId>.<nonce>` — `src/lib/services/player-answer-tokens.ts`. The
 * invitation is named inside the token, which is what lets a capture be
 * attributed to the invitation it belongs to without reading the database.
 */
const ANSWER_TOKEN =
  /^[yn]\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.[A-Za-z0-9_-]+$/;

function buttonToken(record, index) {
  const button = (record.payload?.template?.components ?? []).find(
    (c) => c.type === "button" && Number(c.index) === index,
  );
  const text = button?.parameters?.[0]?.text;
  return typeof text === "string" ? text : null;
}
/** Button 0 is Yes and button 1 is No on all three answerable templates. */
function answerToken(record, answer) {
  return buttonToken(record, answer === "no" ? 1 : 0);
}
function invitationOf(record) {
  for (const index of [0, 1]) {
    const match = ANSWER_TOKEN.exec(buttonToken(record, index) ?? "");
    if (match) return match[1];
  }
  return null;
}
function otherAnswer(answer) {
  return answer === "no" ? "yes" : "no";
}
function recordedResult(results, hash) {
  const file = path.join(results, hash + ".json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

/**
 * What each simulated person is going to do, and when. LAN-298.
 *
 * One answer per invitation, not one per delivered message. A person's profile
 * delay is measured from the **first** delivered capture for that invitation,
 * and every later capture for the same invitation — a reminder, a second
 * invitation, a recruit follow-up — schedules nothing. Before this, each
 * delivered capture scheduled its own action, so a 14-invitee run that sent
 * reminders produced 13 RSVP history rows for 10 current responses: Hollis,
 * Ignatius and Jarrah each answered twice for one invitation, which is not
 * something a real invitee does and made the history unreadable as evidence.
 *
 * A second answer exists only where somebody selected it: `repeat:
 * "after_reminder"` schedules exactly one change of mind, on the first reminder
 * for that same invitation, recording the opposite of the person's event
 * answer. That is the changed-answer scenario the panel could not produce
 * before; it is off by default and labelled as a change wherever it is shown.
 */
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
  const captures = [];
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
    if (!ANSWERABLE_KINDS.includes(kind)) continue;
    captures.push({
      record,
      hash,
      person,
      profile,
      kind,
      at: Date.parse(record.testAt ?? record.at),
      // Wall-clock capture order breaks a tie between two captures the paused
      // test clock stamped with the same simulated instant.
      capturedAt: Date.parse(record.actualAt ?? record.testAt ?? record.at),
    });
  }
  // One group per invitation per person. A capture whose buttons name no
  // invitation cannot be attributed to one, so it stands alone rather than
  // being folded into somebody else's invitation.
  const groups = new Map();
  for (const capture of captures.sort(
    (a, b) => a.at - b.at || a.capturedAt - b.capturedAt || (a.hash < b.hash ? -1 : 1),
  )) {
    const key = capture.person.id + "|" + (invitationOf(capture.record) ?? capture.hash);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(capture);
  }
  const plans = [];
  for (const group of groups.values()) {
    const { profile } = group[0];
    const delay = profile.responder === "prompt" ? 1 / 60 : profile.delayHours;
    const answer = profile.eventAnswer ?? "yes";
    const plan = (capture, stage, stageAnswer, result) => {
      const token = answerToken(capture.record, stageAnswer);
      if (typeof token !== "string") return;
      plans.push({
        id: capture.hash,
        personId: capture.person.id,
        person: capture.person.name,
        kind: capture.kind,
        token,
        file: path.join(results, capture.hash + ".json"),
        at: new Date(capture.at + delay * 3600000).toISOString(),
        result,
        profile: profile.responder,
        completion: profile.completion,
        answer: stageAnswer,
        stage,
      });
    };
    // Any answer already recorded for this invitation completes the one initial
    // plan, whichever capture recorded it. A run that answered twice under the
    // old behaviour therefore reads as answered rather than being answered again.
    plan(
      group[0],
      "first",
      answer,
      group.map((c) => recordedResult(results, c.hash)).find(Boolean) ?? null,
    );
    if (profile.repeat === "after_reminder") {
      const reminder = group.slice(1).find((c) => REMINDER_KINDS.includes(c.kind));
      if (reminder)
        plan(reminder, "change", otherAnswer(answer), recordedResult(results, reminder.hash));
    }
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
            ...(await domain.simulateResponse(plan.personId, plan.token, plan.kind, plan.answer)),
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
