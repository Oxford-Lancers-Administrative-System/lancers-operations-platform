#!/usr/bin/env node
/**
 * Send a real WhatsApp message from Meta's TEST number — LAN-507.
 *
 *   WHATSAPP_TEST_TOKEN=… npm run -s whatsapp:test -- status
 *   WHATSAPP_TEST_TOKEN=… npm run -s whatsapp:test -- create lancers_event_invitation_v3
 *   WHATSAPP_TEST_TOKEN=… npm run -s whatsapp:test -- create-brief --image brief.png
 *   WHATSAPP_TEST_TOKEN=… npm run -s whatsapp:test -- send --template lancers_event_brief_image_v1_test \
 *       --to 13177711900 --image brief.png --param Brian --param "Varsity Bowl" --param "Sat 7 Nov, 2:00 PM"
 *
 * Reaches exactly one thing: the test WhatsApp Business Account that Meta
 * attaches to the "OULAFC Test App", and its test number +1 (555) 672-7410.
 * The account, number and app are literals below and cannot be pointed
 * elsewhere. That account is not the club's: it has its own templates, can
 * message only the handsets registered on the test number's recipient list
 * (five at most), and shows no business name. Nothing sent through it can
 * reach a player.
 *
 * ## Where the token comes from
 *
 * `WHATSAPP_TEST_TOKEN` in the process environment, and nowhere else. It is the
 * 24-hour token the test app's "Step 1. Try it out" page issues (Generate
 * token); `docs/whatsapp-test-account.md` is the procedure. The token is never
 * printed, never written to disk by this script, and the file-backed
 * credentials the retired test box kept are deliberately not read.
 *
 * ## What it does
 *
 *   * `status`        — lists the templates on the test account.
 *   * `create <name>` — creates the production template of that name (from
 *                       scripts/production/whatsapp-templates.json) on the
 *                       test account as `<name>_test`, same body and buttons,
 *                       submitted as Utility. Meta reviews it there too.
 *   * `create-brief`  — creates the event-brief wrapper template
 *                       (`lancers_event_brief_image_v1_test`, image header)
 *                       using `--image <png>` as the review sample.
 *   * `send`          — sends one approved template to one registered number,
 *                       with `--param` for each body slot in order and
 *                       `--image <png>` or `--document <pdf>` for a media header.
 *
 * It never deletes anything.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const TEST_APP_ID = "1601380075107239";
const TEST_WABA_ID = "28245377358425534";
const TEST_PHONE_NUMBER_ID = "1382549608281651";
const TEST_NUMBER_DISPLAY = "+1 (555) 672-7410";
const GRAPH = "https://graph.facebook.com/v26.0/";
const PRODUCTION_RECORD = path.resolve("scripts/production/whatsapp-templates.json");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function token() {
  const value = process.env.WHATSAPP_TEST_TOKEN?.trim();
  if (!value) fail("Set WHATSAPP_TEST_TOKEN to the 24-hour token from the test app page.");
  if (!/^EAA[A-Za-z0-9]+$/.test(value))
    fail("WHATSAPP_TEST_TOKEN does not look like a Meta token.");
  return value;
}

async function graph(route, init = {}, { oauth = false } = {}) {
  const auth = `${oauth ? "OAuth" : "Bearer"} ${token()}`;
  const response = await fetch(GRAPH + route, {
    ...init,
    headers: { ...(init.headers ?? {}), authorization: auth },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = body?.error ?? body;
    fail(`Meta refused ${route.split("?")[0]}: ${JSON.stringify(error)}`);
  }
  return body;
}

function parseArgs(argv) {
  const args = { _: [], param: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      args._.push(item);
      continue;
    }
    const key = item.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) fail(`--${key} needs a value.`);
    index += 1;
    if (key === "param") args.param.push(value);
    else args[key] = value;
  }
  return args;
}

async function uploadSample(file, type) {
  const bytes = fs.readFileSync(file);
  const start = await graph(
    `${TEST_APP_ID}/uploads?file_length=${bytes.length}&file_type=${encodeURIComponent(type)}`,
    { method: "POST" },
  );
  const done = await graph(
    start.id,
    {
      method: "POST",
      headers: { file_offset: "0", "content-type": "application/octet-stream" },
      body: bytes,
    },
    { oauth: true },
  );
  return done.h;
}

async function uploadMedia(file, type) {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", type);
  form.append("file", new Blob([fs.readFileSync(file)], { type }), path.basename(file));
  const media = await graph(`${TEST_PHONE_NUMBER_ID}/media`, { method: "POST", body: form });
  return media.id;
}

async function createTemplate(name, components) {
  const created = await graph(`${TEST_WABA_ID}/message_templates`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      language: "en",
      category: "UTILITY",
      allow_category_change: false,
      message_send_ttl_seconds: 12 * 60 * 60,
      components,
    }),
  });
  console.log(`${name}: ${created.status} (${created.category})`);
}

const SAMPLE_VALUES = {
  inviteeName: "Alex",
  eventName: "Rookie Practice",
  whenLabel: "Sunday 18 October, 10:00",
  venue: "University Parks",
  deadlineLabel: "Saturday 17 October, 10:00",
  changeSummary: "the start time",
  questionSummary: "Which position do you play?",
  cancellationReason: "the pitch is waterlogged",
  outstandingCount: "3",
};

async function commandStatus() {
  const result = await graph(
    `${TEST_WABA_ID}/message_templates?fields=name,status,category,rejected_reason&limit=100`,
  );
  for (const template of result.data ?? []) {
    const reason =
      template.rejected_reason && template.rejected_reason !== "NONE"
        ? ` — ${template.rejected_reason}`
        : "";
    console.log(`${template.name}: ${template.status} (${template.category})${reason}`);
  }
}

async function commandCreate(productionName) {
  if (!productionName) fail("create needs the production template name.");
  const record = JSON.parse(fs.readFileSync(PRODUCTION_RECORD, "utf8"));
  const template = record.find((entry) => entry.name === productionName);
  if (!template) fail(`${productionName} is not in ${PRODUCTION_RECORD}.`);
  const components = [
    {
      type: "BODY",
      text: template.body,
      ...(template.samples?.length
        ? {
            example: {
              body_text: [template.samples.map((s) => SAMPLE_VALUES[s.meaning] ?? s.meaning)],
            },
          }
        : {}),
    },
  ];
  if (template.buttons?.length) {
    components.push({
      type: "BUTTONS",
      buttons: template.buttons.map((button) => ({
        type: "URL",
        text: button.label,
        url: button.url,
        ...(button.url.includes("{{1}}")
          ? { example: [button.url.replace("{{1}}", "sample")] }
          : {}),
      })),
    });
  }
  await createTemplate(`${productionName}_test`, components);
}

async function commandCreateBrief(args) {
  if (!args.image) fail("create-brief needs --image <png> as the review sample.");
  const handle = await uploadSample(args.image, "image/png");
  await createTemplate("lancers_event_brief_image_v1_test", [
    { type: "HEADER", format: "IMAGE", example: { header_handle: [handle] } },
    {
      type: "BODY",
      text: "Hello {{1}}, your brief for {{2}} on {{3}} is attached. It has the itinerary and what to bring.",
      example: {
        body_text: [["Alex", "Varsity Bowl XVII vs Cambridge", "Saturday 7 November, 2:00 PM"]],
      },
    },
  ]);
}

async function commandSend(args) {
  if (!args.template) fail("send needs --template <name>.");
  if (!/^\d{10,15}$/.test(args.to ?? "")) fail("send needs --to <digits with country code, no +>.");
  const components = [];
  if (args.image) {
    const id = await uploadMedia(args.image, "image/png");
    components.push({ type: "header", parameters: [{ type: "image", image: { id } }] });
  } else if (args.document) {
    const id = await uploadMedia(args.document, "application/pdf");
    components.push({
      type: "header",
      parameters: [{ type: "document", document: { id, filename: path.basename(args.document) } }],
    });
  }
  if (args.param.length) {
    components.push({
      type: "body",
      parameters: args.param.map((text) => ({ type: "text", text })),
    });
  }
  const sent = await graph(`${TEST_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: args.to,
      type: "template",
      template: { name: args.template, language: { code: "en" }, components },
    }),
  });
  console.log(
    `${sent.messages?.[0]?.message_status ?? "sent"}: ${args.template} from ${TEST_NUMBER_DISPLAY} to +${args.to}`,
  );
}

const args = parseArgs(process.argv.slice(2));
const [command, ...rest] = args._;
switch (command) {
  case "status":
    await commandStatus();
    break;
  case "create":
    await commandCreate(rest[0]);
    break;
  case "create-brief":
    await commandCreateBrief(args);
    break;
  case "send":
    await commandSend(args);
    break;
  default:
    fail(
      "Usage: whatsapp-test-send.mjs status | create <production name> | create-brief --image <png> | send --template <name> --to <digits> [--param …] [--image <png>|--document <pdf>]",
    );
}
