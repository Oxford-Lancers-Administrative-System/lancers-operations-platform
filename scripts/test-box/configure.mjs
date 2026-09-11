#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import { connectLocal } from "../lib/local-db.mjs";
import { runtime } from "./runtime.mjs";

export const TEST_HOST = "https://marvel-indiscernible-daxton.ngrok-free.dev";

/** The private settings `--sms` mode requires before actual sending or real callbacks. */
export const PRIVATE_SMS_SETTINGS = Object.freeze([
  "TWILIO_ACCOUNT_SID",
  "TWILIO_API_KEY_SID",
  "TWILIO_API_KEY_SECRET",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_ALPHA_SENDER",
]);

/** Sink-mode stubs. None is a credential; the toll-free stub lets +1 testers be intercepted. */
const SINK_STUBS = Object.freeze({
  TWILIO_ACCOUNT_SID: "ACstub",
  TWILIO_API_KEY_SID: "SKstub",
  TWILIO_API_KEY_SECRET: "local-stub-not-a-secret",
  TWILIO_AUTH_TOKEN: "local-stub-not-a-secret",
  TWILIO_ALPHA_SENDER: "OxfLancers",
  TWILIO_FROM_TOLL_FREE: "+18005550100",
});

export function settingsFor(mode, current, privateSettings, baseUrl, contacts) {
  if (!["sink", "sms"].includes(mode)) throw new Error("Choose --sink or --sms.");
  if (mode === "sms") {
    for (const key of PRIVATE_SMS_SETTINGS) {
      if (!privateSettings[key]?.trim())
        throw new Error(`Private test configuration is missing ${key}.`);
    }
  }
  const values = { ...current };
  // Clear provider, email and delivery settings so saved development
  // experiments cannot turn this test into a different type of send.
  for (const key of Object.keys(values)) {
    if (/^(TWILIO_|WHATSAPP_|EMAIL_|DELIVERY_)/.test(key)) delete values[key];
  }
  Object.assign(values, {
    // Keep the owner-provisioned public form origin during local contact refreshes.
    APP_BASE_URL: mode === "sink" && current.APP_BASE_URL !== TEST_HOST ? baseUrl : TEST_HOST,
    SCHEDULER_TRIGGER_TOKEN:
      current.SCHEDULER_TRIGGER_TOKEN || crypto.randomBytes(32).toString("hex"),
    DELIVERY_RECIPIENT_ALLOWLIST:
      mode === "sink"
        ? contacts.phones.join(",")
        : privateSettings.DELIVERY_RECIPIENT_ALLOWLIST || current.DELIVERY_RECIPIENT_ALLOWLIST,
  });
  if (mode === "sink") {
    Object.assign(values, SINK_STUBS);
  } else {
    for (const key of PRIVATE_SMS_SETTINGS) values[key] = privateSettings[key].trim();
    // Optional until toll-free verification clears; +1 destinations are
    // refused with a reason while it is empty.
    const tollFree = (privateSettings.TWILIO_FROM_TOLL_FREE ?? "").trim();
    if (tollFree) values.TWILIO_FROM_TOLL_FREE = tollFree;
  }
  // This panel intercepts every email even when selected phones use Twilio.
  // Keep that test transport configured without loading real email credentials.
  Object.assign(values, {
    EMAIL_API_KEY: "local-stub-not-a-secret",
    EMAIL_FROM_ADDRESS: "Oxford Lancers <events@lancers.example.org>",
    DELIVERY_EMAIL_ALLOWLIST:
      contacts.emails.join(",") || current.DELIVERY_EMAIL_ALLOWLIST || "nobody@example.test",
  });
  return values;
}

export async function main(args = process.argv.slice(2)) {
  if (args.length !== 1 || !["--sink", "--sms"].includes(args[0]))
    throw new Error("Usage: configure.mjs --sink|--sms");
  const mode = args[0].slice(2);
  const { env, baseUrl, databaseUrl } = await runtime();
  const privateFile = ".env.test-box.local";
  const privateSettings = fs.existsSync(privateFile) ? parse(fs.readFileSync(privateFile)) : {};
  const contacts = { phones: [], emails: [] };
  if (mode === "sink") {
    const db = await connectLocal(databaseUrl);
    try {
      const { rows } = await db.query(
        "select distinct kind::text, normalised_value from public.contact_points where normalised_value is not null and btrim(normalised_value) <> ''",
      );
      for (const row of rows) {
        if (row.kind === "phone") contacts.phones.push(row.normalised_value);
        if (row.kind === "email") contacts.emails.push(row.normalised_value);
      }
    } finally {
      await db.end();
    }
    if (!contacts.phones.length) throw new Error("Seed the local test database first.");
  }
  const values = settingsFor(mode, env, privateSettings, baseUrl, contacts);
  const text =
    Object.entries(values)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join("\n") + "\n";
  const temporary = `.env.test-box-write-${process.pid}`;
  try {
    fs.writeFileSync(temporary, text, { mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, ".env.local");
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  console.log(
    `Configured ${mode} mode for Twilio SMS. Restart the app. No messages sent and no credentials displayed.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error(
      "Test configuration failed. Check the lease, local seed and required private test fields; values are not displayed.",
    );
    process.exitCode = 1;
  });
}
