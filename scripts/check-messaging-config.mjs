#!/usr/bin/env node
/**
 * The messaging configuration check — LAN-168.
 *
 * ## What it is for
 *
 * Between an approved Meta template and a real dispatch sits a deployment's own
 * configuration, and every way it can be wrong is silent. A missing phone number
 * id refuses per recipient and records a configuration failure. An allowlist
 * still holding two showcase numbers refuses forty people one at a time while
 * the queue looks busy. A template name that names nothing gets `132001` from
 * Meta, per message, after the club believed it had shipped.
 *
 * So this answers one question — *would this deployment actually send?* — before
 * anybody finds out by watching a roster not receive its invitations.
 *
 * ## It never prints a value
 *
 * Not once, and not "just the first four characters". A token, a phone number id
 * and a recipient list are all either secret or personal data, and the output of
 * a check is the thing people paste into a chat window when they are asking for
 * help. Presence, count and shape are enough to diagnose every fault this can
 * find. Template names and language codes are identifiers rather than secrets,
 * so those are shown: they are exactly what has to be compared against Meta.
 *
 * ## It reads the environment it is run in
 *
 * There is no `--target production` and there will not be one. Agents never
 * reach production, and a check that could would be a check that had to hold
 * production credentials. Brian runs it where the configuration lives.
 *
 * Usage:
 *   node scripts/check-messaging-config.mjs
 *   npm run check:messaging
 *
 * Exit code 0 when the deployment would send, 1 when it would not.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Module from "node:module";

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Same in-memory transpile the manifest generator uses, and for the same reason. */
function load(relativePath) {
  const ts = require("typescript");
  const file = resolve(ROOT, relativePath);
  const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const compiled = new Module(relativePath, null);
  compiled._compile(outputText.replace('require("server-only")', "({})"), file);
  return compiled.exports;
}

const templates = load("src/lib/delivery/templates.ts");
const env = process.env;
const value = (name) => (env[name] ?? "").trim();
const present = (name) => value(name) !== "";

const problems = [];
const warnings = [];
const lines = [];

function report(label, ok, detail) {
  lines.push(`  ${ok ? "ok " : "-- "} ${label.padEnd(34)} ${detail}`);
}

// ---------------------------------------------------------------------------
// 1. The variables the sending path refuses to run without.
// ---------------------------------------------------------------------------
lines.push("\nOutbound — WhatsApp");
const OUTBOUND = [
  "APP_BASE_URL",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_TEMPLATE_NAME",
  "DELIVERY_RECIPIENT_ALLOWLIST",
];
for (const name of OUTBOUND) {
  const ok = present(name);
  if (!ok) problems.push(`${name} is not set, so WhatsApp sends to nobody.`);
  // `WHATSAPP_TEMPLATE_NAME` is an identifier and is shown; everything else in
  // this list is a secret, a number id or a list of people's telephone numbers.
  const detail = !ok ? "not set" : name === "WHATSAPP_TEMPLATE_NAME" ? value(name) : "set";
  report(name, ok, detail);
}

// ---------------------------------------------------------------------------
// 2. The callback path.
// ---------------------------------------------------------------------------
lines.push("\nWebhook — delivery receipts and inbound");
for (const name of ["WHATSAPP_APP_SECRET", "WHATSAPP_WEBHOOK_VERIFY_TOKEN"]) {
  const ok = present(name);
  if (!ok) {
    warnings.push(
      `${name} is not set. Messages still send; Meta's delivery receipts are refused, ` +
        "so every message stays looking sent and no failure reaches the follow-up queue.",
    );
  }
  report(name, ok, ok ? "set" : "not set");
}

// ---------------------------------------------------------------------------
// 3. The email rung.
// ---------------------------------------------------------------------------
lines.push("\nOutbound — email (the third rung, and the automatic fallback)");
for (const name of ["EMAIL_API_KEY", "EMAIL_FROM_ADDRESS", "DELIVERY_EMAIL_ALLOWLIST"]) {
  const ok = present(name);
  if (!ok) {
    warnings.push(
      `${name} is not set, so the email rung sends to nobody. WhatsApp still works; ` +
        "a player who ignores both WhatsApp rungs is never reached by the third.",
    );
  }
  report(name, ok, ok ? (name === "EMAIL_FROM_ADDRESS" ? "set" : "set") : "not set");
}

// ---------------------------------------------------------------------------
// 4. Every template this deployment would send through.
// ---------------------------------------------------------------------------
lines.push("\nTemplates — the name each kind sends under");
const META_NAME = /^[a-z0-9_]+$/;
for (const kind of templates.MESSAGE_KINDS) {
  const variable = templates.templateNameVariable(kind);
  const override = value(variable);
  const name = override !== "" ? override : templates.TEMPLATE_NAMES[kind];
  const source = override !== "" ? `from ${variable}` : "default";

  if (name === "") {
    problems.push(`${kind} resolves to no template name at all.`);
    report(kind, false, "unresolved");
    continue;
  }
  if (!META_NAME.test(name)) {
    problems.push(
      `${kind} resolves to "${name}", which Meta will not accept: template names are ` +
        "lowercase letters, digits and underscores only.",
    );
    report(kind, false, `${name} (invalid)`);
    continue;
  }
  report(kind, true, `${name} (${source})`);
}

// ---------------------------------------------------------------------------
// 5. Coherence — the faults that are not a missing variable.
// ---------------------------------------------------------------------------
lines.push("\nCoherence");

const baseUrl = value("APP_BASE_URL").replace(/\/+$/, "");
if (baseUrl !== "") {
  const secure = baseUrl.startsWith("https://");
  const loopback = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(baseUrl);
  if (!secure && !loopback) {
    problems.push(
      "APP_BASE_URL is not https. Every answer link the club sends would be issued over " +
        "plain http, and a one-time token is a credential.",
    );
  }
  report(
    "APP_BASE_URL scheme",
    secure || loopback,
    loopback ? "loopback" : secure ? "https" : "http",
  );

  // The manifest's button bases are generated against one host. If the running
  // deployment issues links on another, every approved button still points at
  // the host Meta holds and the token in the link belongs to somewhere else.
  const manifest = readFileSync(resolve(ROOT, "docs/whatsapp-template-manifest.md"), "utf8");
  const manifestHost = manifest.match(/https:\/\/[a-z0-9.-]+/i)?.[0] ?? "";
  const agrees = manifestHost !== "" && baseUrl === manifestHost;
  if (!agrees && !loopback) {
    problems.push(
      `APP_BASE_URL is ${baseUrl} but the approved templates carry ${manifestHost}. ` +
        "Meta holds the button prefix, so every button would send the recipient to the " +
        "other host with a token it cannot resolve. Regenerate the manifest and resubmit, " +
        "or correct APP_BASE_URL.",
    );
  }
  report(
    "host matches the manifest",
    agrees || loopback,
    agrees ? "yes" : loopback ? "loopback" : "NO",
  );
}

const allowlistRaw = value("DELIVERY_RECIPIENT_ALLOWLIST");
if (allowlistRaw !== "") {
  // Count only. These are people's telephone numbers.
  const entries = allowlistRaw.split(/[,;\n\r\s]+/).filter((entry) => entry.trim() !== "");
  const usable = entries.filter((entry) => /^\+?\d[\d\s()-]{5,}$/.test(entry));
  if (usable.length === 0) {
    problems.push(
      "DELIVERY_RECIPIENT_ALLOWLIST is set but nothing in it parses as a telephone number, " +
        "so it permits nobody. A stray comma is not permission.",
    );
  } else if (usable.length < entries.length) {
    warnings.push(
      `DELIVERY_RECIPIENT_ALLOWLIST has ${entries.length} entries but only ${usable.length} ` +
        "parse as telephone numbers. The rest permit nobody.",
    );
  }
  report("recipient allowlist", usable.length > 0, `${usable.length} number(s) permitted`);

  // The failure this exists to catch: a list sized for a demonstration, still in
  // place for a roster. It cannot know the roster, so it says the number and
  // lets a human recognise it.
  if (usable.length > 0 && usable.length <= 3) {
    warnings.push(
      `DELIVERY_RECIPIENT_ALLOWLIST permits only ${usable.length} recipient(s). If this ` +
        "deployment is meant to message a roster, everybody else is refused one at a time " +
        "while the queue looks busy.",
    );
  }
}

const language = value("WHATSAPP_TEMPLATE_LANGUAGE") || "en_GB (default)";
report("template language", true, language);

// ---------------------------------------------------------------------------
// Verdict.
// ---------------------------------------------------------------------------
console.log("Messaging configuration");
console.log(lines.join("\n"));

if (warnings.length > 0) {
  console.log("\nWarnings — this deployment sends, but not everything works:");
  for (const warning of warnings) console.log(`  * ${warning}`);
}

if (problems.length > 0) {
  console.log("\nThis deployment would NOT send:");
  for (const problem of problems) console.log(`  * ${problem}`);
  console.log("");
  process.exit(1);
}

console.log("\nThis deployment is configured to send.\n");
