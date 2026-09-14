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

import { MESSAGE_TEMPLATES } from "../../src/lib/delivery/templates";
import { submittedPreview } from "./message-preview.mjs";
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
export function testTransport(source) {
  active();
  const sink = createDeliverySink(source);
  return async (url, init) => {
    const { state } = active();
    const target = new URL(url);
    // This apparatus is for WhatsApp. Email remains intercepted; selecting a
    // real phone is never implicit consent to actual email egress.
    if (target.pathname.endsWith("/emails")) return sink(url, init);
    let payload;
    try {
      payload = JSON.parse(init.body);
    } catch {
      throw new Error("The test router could not read the template payload.");
    }
    assertProviderRequest(url, payload);
    const people = (
      await getPool().query(
        `select p.id,coalesce(c.normalised_value,c.raw_value) as phone from people p join contact_points c on c.person_id=p.id where p.merged_into_person_id is null and c.kind='phone' and c.valid_until is null`,
      )
    ).rows;
    // Multiple contact rows on one identity do not make two different people.
    const matching = [
      ...new Map(
        people
          .filter((p) => normalizeDestination(p.phone) === normalizeDestination(payload.to))
          .map((p) => [p.id, p]),
      ).values(),
    ];
    const choice = routeRecipient(payload.to, matching, state.people);
    if (choice.mode === "intercepted") {
      const capture = createDeliverySink(source, {
        failFor: choice.outcome === "failed" ? [String(payload.to)] : [],
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
    const submissionsFile = path.join(directory, "template-submissions.json");
    if (!fs.existsSync(submissionsFile))
      throw new Error("Load the approved test submission records before actual sending.");
    const definition = JSON.parse(fs.readFileSync(submissionsFile, "utf8")).templates.find(
      (t) => t.name === payload.template.name,
    );
    const contract = definition && MESSAGE_TEMPLATES[definition.kind];
    const preview =
      contract &&
      submittedPreview(directory, { channel: "whatsapp", payload }, contract.parameterNames);
    if (!preview || preview.warnings.length)
      throw new Error(
        "The test sender and submitted template do not match. Resolve the application prerequisite before actual delivery.",
      );
    const privateSettings = parse(fs.readFileSync(".env.test-box.local"));
    if (
      !/^\d+$/.test(privateSettings.WHATSAPP_PHONE_NUMBER_ID ?? "") ||
      !privateSettings.WHATSAPP_ACCESS_TOKEN
    )
      throw new Error("Private WhatsApp test credentials are not ready.");
    if (source.APP_BASE_URL !== "https://marvel-indiscernible-daxton.ngrok-free.dev")
      throw new Error("Actual test messages require the configured test tunnel for their links.");
    // Record intent before the network; inability to preserve evidence refuses
    // the send. Neither headers nor credential values enter the record.
    recordEvidence({
      at: new Date().toISOString(),
      actualAt: new Date().toISOString(),
      transport: "real",
      personId: choice.personId,
      channel: "whatsapp",
      recipient: String(payload.to),
      payload,
      phase: "requested",
    });
    const version = target.pathname.split("/")[1];
    const response = await fetch(
      `https://graph.facebook.com/${version}/${privateSettings.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${privateSettings.WHATSAPP_ACCESS_TOKEN}`,
        },
        body: JSON.stringify(payload),
        redirect: "error",
        signal: AbortSignal.timeout(30000),
      },
    );
    let id = null;
    try {
      id = (await response.clone().json()).messages?.[0]?.id ?? null;
    } catch {
      /* The provider adapter interprets invalid responses. */
    }
    try {
      recordEvidence({
        at: new Date().toISOString(),
        actualAt: new Date().toISOString(),
        transport: "real",
        personId: choice.personId,
        channel: "whatsapp",
        recipient: String(payload.to),
        payload,
        phase: response.ok ? "accepted" : "refused",
        providerMessageId: id,
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
