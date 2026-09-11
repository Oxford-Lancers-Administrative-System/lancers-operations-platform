import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { parse } from "dotenv";
import { createDeliverySink } from "../../src/lib/delivery/local-sink";
import { getPool } from "../../src/lib/db/connection";
import { readPanelState } from "./panel-state.mjs";
import { normalizeDestination, routeRecipient, assertProviderRequest } from "./routing.mjs";
import { resolveLocalDatabaseUrl } from "../lib/local-db.mjs";
import { TEST_HOST } from "./configure.mjs";
import { clockSql } from "./sql-clock.mjs";

const directory = path.resolve(".lancers-runtime");
function active() {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.K_SERVICE ||
    process.env.LANCERS_TEST_BOX !== "1"
  )
    throw new Error("Test integration is unavailable outside the local development process.");
  const local = parse(fs.readFileSync(".env.local"));
  const expected = resolveLocalDatabaseUrl(local.SUPABASE_DB_URL);
  const actual = resolveLocalDatabaseUrl(process.env.DATABASE_URL);
  if (new URL(actual).port !== new URL(expected).port || process.env.PORT !== local.PORT)
    throw new Error("Test integration does not match the local worktree.");
  if (process.env.LANCERS_TEST_PANEL !== "1")
    fs.writeFileSync(
      path.join(directory, "app-hooks-active.json"),
      JSON.stringify({
        pid: process.pid,
        appPort: Number(process.env.PORT),
        at: new Date().toISOString(),
      }),
      { mode: 0o600 },
    );
  return { local, state: readPanelState(directory) };
}
export function applicationNow() {
  const { state } = active();
  if (state.clock && !Number.isFinite(Date.parse(state.clock)))
    throw new Error("Invalid test clock.");
  return state.clock ? new Date(state.clock) : new Date();
}
export function applicationSql(sql) {
  const { state } = active();
  return state.clock ? clockSql(sql) : sql;
}
export function testSource(source) {
  active();
  // The app still validates configuration and eligibility. Recipient membership
  // is bypassed separately by the guarded local-testing hook below.
  return source;
}
// Brian: remove recipient allowlists from the local testing apparatus.
// active() still verifies development mode and the matching local database.
export function testRecipientsUnrestricted() {
  active();
  return true;
}
function recordEvidence(entry) {
  const target = path.join(directory, "transport-evidence");
  fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(target, crypto.randomUUID() + ".json"), JSON.stringify(entry), {
    mode: 0o600,
    flag: "wx",
  });
}
function parseForm(body) {
  const form = {};
  for (const [key, value] of new URLSearchParams(typeof body === "string" ? body : ""))
    form[key] = value;
  return form;
}
export function testTransport(source) {
  active();
  const sink = createDeliverySink(source);
  return async (url, init) => {
    const { state } = active();
    const target = new URL(url);
    // This apparatus is for SMS. Email remains intercepted; selecting a real
    // phone is never implicit consent to actual email egress.
    if (target.pathname.endsWith("/emails")) return sink(url, init);
    const form = parseForm(init.body);
    assertProviderRequest(url, form);
    const people = (
      await getPool().query(
        `select p.id,coalesce(c.normalised_value,c.raw_value) as phone from people p join contact_points c on c.person_id=p.id where p.merged_into_person_id is null and c.kind='phone' and c.valid_until is null`,
      )
    ).rows;
    // Multiple contact rows on one identity do not make two different people.
    const matching = [
      ...new Map(
        people
          .filter((p) => normalizeDestination(p.phone) === normalizeDestination(form.To))
          .map((p) => [p.id, p]),
      ).values(),
    ];
    const choice = routeRecipient(form.To, matching, state.people);
    if (choice.mode === "intercepted") {
      const capture = createDeliverySink(source, {
        failFor: choice.outcome === "failed" ? [String(form.To)] : [],
        write: (record) => {
          recordEvidence({
            ...record,
            transport: "intercepted",
            personId: choice.personId,
            simulatedOutcome: choice.outcome,
            testAt: applicationNow().toISOString(),
            identity: state.people[choice.personId]?.identity ?? "unclassified",
            actualAt: new Date().toISOString(),
          });
        },
      });
      return capture(url, init);
    }
    const privateSettings = parse(fs.readFileSync(".env.test-box.local"));
    for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_API_KEY_SID", "TWILIO_API_KEY_SECRET"]) {
      if (!privateSettings[key]?.trim())
        throw new Error("Private Twilio test credentials are not ready.");
    }
    if (source.APP_BASE_URL !== TEST_HOST)
      throw new Error("Actual test messages require the configured test tunnel for their links.");
    if (!form.StatusCallback.startsWith(TEST_HOST + "/"))
      throw new Error("Actual test messages must report delivery to the configured test tunnel.");
    // A real callback is verified against the real Auth Token, so the app must
    // be running in `--sms` mode, not on the sink stub.
    if (!source.TWILIO_AUTH_TOKEN || source.TWILIO_AUTH_TOKEN === "local-stub-not-a-secret")
      throw new Error("Run configure.mjs --sms and restart before actual sending.");
    const kind = new URL(form.StatusCallback).searchParams.get("kind") ?? "unknown";
    // Record intent before the network; inability to preserve evidence refuses
    // the send. Neither headers nor credential values enter the record.
    recordEvidence({
      at: new Date().toISOString(),
      actualAt: new Date().toISOString(),
      transport: "real",
      personId: choice.personId,
      channel: "sms",
      kind,
      recipient: String(form.To),
      payload: form,
      phase: "requested",
    });
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(privateSettings.TWILIO_ACCOUNT_SID.trim())}/Messages.json`,
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          authorization:
            "Basic " +
            Buffer.from(
              `${privateSettings.TWILIO_API_KEY_SID.trim()}:${privateSettings.TWILIO_API_KEY_SECRET.trim()}`,
            ).toString("base64"),
        },
        body: new URLSearchParams(form).toString(),
        redirect: "error",
        signal: AbortSignal.timeout(30000),
      },
    );
    let id = null;
    let status = null;
    try {
      const answered = await response.clone().json();
      id = answered.sid ?? null;
      status = answered.status ?? answered.code ?? null;
    } catch {
      /* The provider adapter interprets invalid responses. */
    }
    try {
      recordEvidence({
        at: new Date().toISOString(),
        actualAt: new Date().toISOString(),
        transport: "real",
        personId: choice.personId,
        channel: "sms",
        kind,
        recipient: String(form.To),
        payload: form,
        phase: response.ok ? "accepted" : "refused",
        providerMessageId: id,
        providerStatus: status,
        httpStatus: response.status,
      });
    } catch {
      /* The app must retain the actual provider response after egress. The durable request record remains pending inspection. */
    }
    return response;
  };
}

export async function testTransaction(client) {
  active();
  // Clock advancement waits for in-flight application transactions to finish.
  await client.query("select pg_advisory_xact_lock_shared(2220910)");
  const { state } = active();
  if (state.clock) {
    if (!Number.isFinite(Date.parse(state.clock))) throw new Error("Invalid test clock.");
    await client.query("select set_config('lancers_test.clock',$1,true)", [state.clock]);
  }
}
