import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { runtime } from "./runtime.mjs";
import { connectLocal } from "../lib/local-db.mjs";
import { snapshot } from "./panel-data.mjs";
import {
  requestAllowed,
  readPanelState,
  writePanelState,
  validatePersonSettings,
} from "./panel-state.mjs";
import { submittedPreview } from "./message-preview.mjs";
import { expectations } from "./expectations.mjs";
import { loadDomain } from "./load-domain.mjs";
import { createProgression, responsePlans } from "./progression.mjs";

export async function startPanel() {
  if (process.env.NODE_ENV === "production" || process.env.K_SERVICE)
    throw new Error("The test panel runs only in local development.");
  const active = await runtime();
  const directory = path.resolve(".lancers-runtime");
  const assets = path.join(directory, "panel-assets");
  fs.mkdirSync(assets, { recursive: true, mode: 0o700 });
  await build({
    entryPoints: ["scripts/test-box/panel/app.jsx"],
    bundle: true,
    outfile: path.join(assets, "app.js"),
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "silent",
  });
  const db = await connectLocal(active.databaseUrl);
  const session = crypto.randomBytes(32).toString("hex");
  const csrf = crypto.randomBytes(32).toString("hex");
  let port;
  const domain = await loadDomain(active.env);
  const readPeople = async () =>
    (
      await db.query(
        `select p.id,concat_ws(' ',p.given_name,p.family_name) as name,(select coalesce(c.normalised_value,c.raw_value) from contact_points c where c.person_id=p.id and c.kind='phone' and c.valid_until is null order by c.is_preferred desc,c.created_at desc limit 1) as phone from people p where p.merged_into_person_id is null`,
      )
    ).rows;
  const runner = createProgression(db, directory, domain, readPeople);
  const callbackTimer = setInterval(() => {
    if (!runner.status().busy && routingReady()) runner.run().catch(() => {});
  }, 10000);
  function routingReady() {
    try {
      const bridge = JSON.parse(
        fs.readFileSync(path.join(directory, "app-hooks-active.json"), "utf8"),
      );
      process.kill(bridge.pid, 0);
      return bridge.appPort === active.lease.applicationPort;
    } catch {
      return false;
    }
  }
  const server = http.createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    const send = (status, data) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(data));
    };
    if (
      !requestAllowed(request, port, {
        mutation: !["GET", "HEAD"].includes(request.method),
        session,
        csrf,
      })
    ) {
      send(403, { error: "Open the testing panel directly on this Mac." });
      return;
    }
    try {
      const url = new URL(request.url, `http://127.0.0.1:${port}`);
      if (request.method === "GET" && url.pathname === "/") {
        response.setHeader(
          "Set-Cookie",
          `lancers_test_panel=${session}; HttpOnly; SameSite=Strict; Path=/`,
        );
        response.writeHead(200, { "content-type": "text/html;charset=utf-8" });
        response.end(
          `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="test-panel" content="${csrf}"><title>Lancers · WhatsApp testing</title></head><body style="margin:0"><div id="root"></div><script src="/app.js" defer></script></body></html>`,
        );
        return;
      }
      if (request.method === "GET" && url.pathname === "/app.js") {
        response.writeHead(200, { "content-type": "text/javascript" });
        fs.createReadStream(path.join(assets, "app.js")).pipe(response);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/snapshot") {
        const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
        const personId = url.searchParams.get("person") || null;
        const eventId = url.searchParams.get("event") || null;
        if ((personId && !uuid.test(personId)) || (eventId && !uuid.test(eventId))) {
          send(400, { error: "Choose a person or event from the list." });
          return;
        }
        await runtime();
        const data = await snapshot(db, directory, { personId, eventId });
        data.jobs = data.jobs.map((job) => ({
          ...job,
          preview: submittedPreview(
            directory,
            job.capture,
            domain.MESSAGE_TEMPLATES[job.kind]?.parameterNames ?? [],
          ),
        }));
        const checklist = await expectations(db, {
          personId,
          eventId,
          now: Date.parse(data.clock ?? data.asOf),
        });
        send(200, {
          ...data,
          checklist,
          appUrl: `http://localhost:${active.lease.applicationPort}`,
          capabilities: { routing: routingReady(), clock: routingReady(), responders: true },
          runner: runner.status(),
          responses: responsePlans(directory, data.people).map((plan) =>
            Object.fromEntries(
              Object.entries(plan).filter(([key]) => !["token", "file"].includes(key)),
            ),
          ),
          callbackError: runner.status().lastError,
          notes: [
            "Application job plans are shown here; independent workflow expectations are not connected yet.",
            "Full WhatsApp body copy depends on LAN-286. Captured template parameters are shown without inventing text.",
          ],
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/run") {
        if (!routingReady()) {
          send(409, { error: "Start the local test app first." });
          return;
        }
        let body = "";
        for await (const chunk of request) {
          body += chunk;
          if (Buffer.byteLength(body) > 1024) {
            send(413, { error: "Run request too large." });
            return;
          }
        }
        let hours;
        try {
          hours = JSON.parse(body).hours;
        } catch {
          send(400, { error: "Enter the hours to advance." });
          return;
        }
        if (typeof hours !== "number" || !Number.isFinite(hours) || hours < 0 || hours > 8760) {
          send(400, { error: "Enter hours from 0 to 8760." });
          return;
        }
        if (runner.status().busy) {
          send(409, { error: "A test run is already in progress." });
          return;
        }
        // Respond promptly; progress and any failure stay visible in snapshots.
        runner.run(hours).catch(() => {});
        send(202, { started: true });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/person") {
        if (!routingReady()) {
          send(409, {
            error: "Start the app with its local test integration before changing routing.",
          });
          return;
        }
        let text = "";
        for await (const chunk of request) {
          text += chunk;
          if (Buffer.byteLength(text) > 8192) {
            send(413, { error: "Person settings are too large." });
            return;
          }
        }
        let input;
        try {
          input = JSON.parse(text);
        } catch {
          send(400, { error: "Person settings could not be read." });
          return;
        }
        if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.personId ?? "")) {
          send(400, { error: "Choose a person first." });
          return;
        }
        await runtime();
        const data = await snapshot(db, directory, { personId: input.personId, limit: 1 });
        const person = data.people.find((p) => p.id === input.personId);
        if (!person) {
          send(404, { error: "That person is no longer available." });
          return;
        }
        let settings;
        try {
          settings = validatePersonSettings(input.settings, person);
        } catch (error) {
          send(400, { error: error.message });
          return;
        }
        if (
          settings.delivery === "real" &&
          active.env.APP_BASE_URL !== "https://marvel-indiscernible-daxton.ngrok-free.dev"
        ) {
          send(409, {
            error:
              "Configure and restart the test app with its test tunnel before enabling actual delivery.",
          });
          return;
        }
        if (runner.status().busy) {
          send(409, { error: "Wait for the current test run before changing people." });
          return;
        }
        const state = readPanelState(directory);
        state.people[input.personId] = settings;
        writePanelState(directory, state);
        send(200, { saved: true });
        return;
      }
      send(404, { error: "This test-panel action is not available." });
    } catch {
      send(503, {
        error: "The local test data could not be read. Check the leased database and retry.",
      });
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  port = server.address().port;
  fs.writeFileSync(
    path.join(directory, "panel-runtime.json"),
    JSON.stringify({
      pid: process.pid,
      port,
      url: `http://127.0.0.1:${port}`,
      startedAt: new Date().toISOString(),
    }),
    { mode: 0o600 },
  );
  console.log(`Local WhatsApp test panel: http://127.0.0.1:${port}`);
  const stop = () => {
    clearInterval(callbackTimer);
    server.close(() => db.end().finally(() => process.exit(0)));
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  startPanel().catch(() => {
    console.error(
      "The local test panel could not start. Check dependencies and this worktree’s database lease.",
    );
    process.exitCode = 1;
  });
