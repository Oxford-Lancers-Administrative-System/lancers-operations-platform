import fs from "node:fs";

/**
 * Writing `.env.local` without destroying what somebody put there by hand.
 *
 * `db:start` owns nine lines of the file: the stack's address, keys and ports,
 * which change with the slot and must never be stale. Until 2 October 2026 it
 * wrote the whole file from those nine, so every other line was erased on each
 * start. That cost `AGENT_READONLY_PASSWORD` (LAN-435) on 28 September and with
 * it every production read for days. Brian: "I put something into .env.local
 * because it needs to be there."
 *
 * The rule: a line whose key the caller generates is replaced; every other
 * line, comment and blank is kept exactly as it was, in its order.
 */

const ASSIGNMENT = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;

function keyOf(line) {
  return ASSIGNMENT.exec(line)?.[1] ?? null;
}

/** The new file text: the generated lines, then everything else that was there. */
export function mergeEnvLocal(existingText, generatedLines) {
  const generated = generatedLines.filter((line) => line !== "");
  const owned = new Set(generated.map(keyOf).filter(Boolean));
  const kept = (existingText ?? "").split(/\r?\n/).filter((line) => {
    const key = keyOf(line);
    return key === null ? line.trim() !== "" : !owned.has(key);
  });
  return [...generated, ...kept, ""].join("\n");
}

/** Replace the caller's own lines in the file at `filePath`; keep the rest. */
export function writeEnvLocal(filePath, generatedLines) {
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  fs.writeFileSync(filePath, mergeEnvLocal(existing, generatedLines), { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}
