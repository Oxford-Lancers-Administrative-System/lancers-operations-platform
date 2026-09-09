#!/usr/bin/env node
/** LAN-222: summarize accepted local sink records without displaying payloads or tokens. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function countRecords(records) {
  const groups = new Map();
  const seen = new Set();
  for (const record of records) {
    if (
      !record ||
      !["whatsapp", "email"].includes(record.channel) ||
      typeof record.recipient !== "string" ||
      !record.recipient.trim() ||
      typeof record.kind !== "string" ||
      !record.kind.trim() ||
      typeof record.providerMessageId !== "string" ||
      !record.providerMessageId.trim() ||
      typeof record.at !== "string" ||
      !Number.isFinite(Date.parse(record.at))
    ) {
      throw new Error("Invalid sink record; no complete count can be reported.");
    }
    const identity = JSON.stringify([record.channel, record.providerMessageId]);
    if (seen.has(identity)) throw new Error("Duplicate sink message; count would be ambiguous.");
    seen.add(identity);
    // The existing sink labels every email 'invitation', irrespective of its
    // actual kind. Do not turn that placeholder into misleading volume evidence.
    const kind = record.channel === "email" ? "unclassified_email" : record.kind;
    const key = JSON.stringify([record.channel, record.recipient, kind]);
    const at = new Date(record.at).toISOString();
    const group = groups.get(key) ?? {
      recipient: record.recipient,
      channel: record.channel,
      kind,
      count: 0,
      first: at,
      last: at,
    };
    group.count += 1;
    if (at < group.first) group.first = at;
    if (at > group.last) group.last = at;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) =>
    JSON.stringify([a.recipient, a.channel, a.kind]).localeCompare(
      JSON.stringify([b.recipient, b.channel, b.kind]),
    ),
  );
}

export function readSinkRecords(directory) {
  let files;
  try {
    files = fs.readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw new Error("Cannot read the local sink directory.");
  }
  return files
    .filter((file) => file.name.endsWith(".json"))
    .map((file) => {
      if (!file.isFile()) throw new Error("A sink entry is not a regular file.");
      try {
        return JSON.parse(fs.readFileSync(path.join(directory, file.name), "utf8"));
      } catch {
        // Parse errors can quote the source, which contains bearer-link tokens.
        throw new Error("Cannot parse a sink record; no complete count can be reported.");
      }
    });
}

export function main(args = process.argv.slice(2)) {
  if (args.length) throw new Error("Usage: node scripts/test-box/count.mjs");
  const records = readSinkRecords(path.resolve(".lancers-runtime/delivery-sink"));
  const groups = countRecords(records);
  console.log("Accepted sink messages only; this is not real-phone delivery evidence.");
  console.log("Phone and email addresses are separate recipients; no person identity is inferred.");
  console.log("Email kinds are unclassified because the current sink does not record them.");
  console.log("recipient\tchannel\tkind\tcount\tfirst UTC\tlast UTC");
  for (const group of groups) {
    console.log(
      [group.recipient, group.channel, group.kind, group.count, group.first, group.last]
        .map((value) => JSON.stringify(value))
        .join("\t"),
    );
  }
  console.log(
    `Total: ${records.length} messages across ${new Set(records.map((r) => JSON.stringify([r.channel, r.recipient]))).size} recipient addresses.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
