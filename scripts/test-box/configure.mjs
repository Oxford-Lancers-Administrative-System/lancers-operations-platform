#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import ts from "typescript";
import { connectLocal } from "../lib/local-db.mjs";
import { runtime } from "./runtime.mjs";

export const TEST_HOST = "https://marvel-indiscernible-daxton.ngrok-free.dev";

/** Read names as data, without importing server code or evaluating the registry. */
export function templateNames(text) {
  const source = ts.createSourceFile("templates.ts", text, ts.ScriptTarget.Latest, true);
  let names;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "TEMPLATE_NAMES") {
      const object = node.initializer?.arguments?.[0];
      if (!object || !ts.isObjectLiteralExpression(object))
        throw new Error("Template registry shape changed.");
      names = Object.fromEntries(
        object.properties.map((property) => {
          if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.initializer)) {
            throw new Error("Template names must remain literal registry data.");
          }
          return [property.name.getText(source).replace(/['"]/g, ""), property.initializer.text];
        }),
      );
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!names || !names.invitation) throw new Error("Template registry was not found.");
  return names;
}

export function settingsFor(mode, current, privateSettings, baseUrl, names, contacts) {
  if (!["sink", "whatsapp"].includes(mode)) throw new Error("Choose --sink or --whatsapp.");
  if (mode === "whatsapp") {
    for (const key of [
      "WHATSAPP_PHONE_NUMBER_ID",
      "WHATSAPP_ACCESS_TOKEN",
      "WHATSAPP_APP_SECRET",
      "DELIVERY_RECIPIENT_ALLOWLIST",
    ]) {
      if (!privateSettings[key]?.trim())
        throw new Error(`Private test configuration is missing ${key}.`);
    }
  }
  const values = { ...current };
  // Clear optional transport modes and host overrides so saved development
  // experiments cannot turn this template test into a different type of send.
  for (const key of Object.keys(values)) {
    if (key.startsWith("WHATSAPP_") || key.startsWith("EMAIL_") || key.startsWith("DELIVERY_"))
      delete values[key];
  }
  Object.assign(values, {
    APP_BASE_URL: mode === "sink" ? baseUrl : TEST_HOST,
    SCHEDULER_TRIGGER_TOKEN:
      current.SCHEDULER_TRIGGER_TOKEN || crypto.randomBytes(32).toString("hex"),
    WHATSAPP_TEMPLATE_LANGUAGE: "en_GB",
    WHATSAPP_PHONE_NUMBER_ID:
      mode === "sink" ? "local-stub" : privateSettings.WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_ACCESS_TOKEN:
      mode === "sink" ? "local-stub-not-a-secret" : privateSettings.WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_APP_SECRET:
      mode === "sink" ? "local-stub-not-a-secret" : privateSettings.WHATSAPP_APP_SECRET,
    WHATSAPP_WEBHOOK_VERIFY_TOKEN:
      privateSettings.WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
      current.WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
      crypto.randomBytes(32).toString("hex"),
    DELIVERY_RECIPIENT_ALLOWLIST:
      mode === "sink" ? contacts.phones.join(",") : privateSettings.DELIVERY_RECIPIENT_ALLOWLIST,
  });
  if (mode === "sink") {
    Object.assign(values, {
      EMAIL_API_KEY: "local-stub-not-a-secret",
      EMAIL_FROM_ADDRESS: "Oxford Lancers <events@lancers.example.org>",
      DELIVERY_EMAIL_ALLOWLIST: contacts.emails.join(",") || "nobody@example.test",
    });
  } else if (privateSettings.EMAIL_API_KEY?.trim()) {
    for (const key of ["EMAIL_FROM_ADDRESS", "DELIVERY_EMAIL_ALLOWLIST"]) {
      if (!privateSettings[key]?.trim())
        throw new Error(`Private test configuration is missing ${key}.`);
    }
    for (const key of ["EMAIL_API_KEY", "EMAIL_FROM_ADDRESS", "DELIVERY_EMAIL_ALLOWLIST"])
      values[key] = privateSettings[key];
  }
  for (const [kind, name] of Object.entries(names)) {
    const key =
      kind === "invitation" ? "WHATSAPP_TEMPLATE_NAME" : `WHATSAPP_TEMPLATE_${kind.toUpperCase()}`;
    values[key] = `${name}_test`;
  }
  return values;
}

export async function main(args = process.argv.slice(2)) {
  if (args.length !== 1 || !["--sink", "--whatsapp"].includes(args[0]))
    throw new Error("Usage: configure.mjs --sink|--whatsapp");
  const mode = args[0].slice(2);
  const { env, baseUrl, databaseUrl } = await runtime();
  const names = templateNames(fs.readFileSync("src/lib/delivery/templates.ts", "utf8"));
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
  const values = settingsFor(mode, env, privateSettings, baseUrl, names, contacts);
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
    `Configured ${mode} mode with ${Object.keys(names).length} test template names. Restart the app. No messages sent and no credentials displayed.`,
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
