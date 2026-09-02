// Build every proposal from the shared prelude plus one screen body.
// Run from the worktree root:
//   node missions/intake/M-ONBOARDING-AND-INFORMATION-COMPLETION/mockups/build-proposals.mjs
//
// Ported unchanged in shape from M-RECRUITMENT, which established it. The async
// wrapper is the load-bearing part: a proposal may drive the real form — fill
// it, press the application's own button, wait for what it renders — so a
// screen shows shipped behaviour rather than a drawing of it.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { format, resolveConfig } from "prettier";
const ROOT = "missions/intake/M-ONBOARDING-AND-INFORMATION-COMPLETION/mockups";
const SRC = path.join(ROOT, "src");
const OUT = path.join(ROOT, "proposals");
mkdirSync(OUT, { recursive: true });
const prelude = readFileSync(path.join(SRC, "_prelude.js"), "utf8");
let n = 0;
// Helpers some workflows share and others must not see. W4 built the
// player-facing signed-link page; W5 is that same page opened later, so both
// need it — and W1, W2 and W3, which are approved, must keep the exact bytes
// their shots.json hashes were taken from. Naming the sharing here rather than
// deriving it from the filename is what lets W5 reuse W4's helpers without
// either duplicating three hundred lines or disturbing an approved workflow.
const SHARED_BY_WORKFLOW = {
  W4: ["_player-page.js"],
  W5: ["_player-page.js"],
  W6: ["_record-page.js"],
  W7: ["_person-page.js"],
  W8: ["_queue-page.js"],
};
for (const file of readdirSync(SRC).sort()) {
  if (file.startsWith("_") || !file.endsWith(".js")) continue;
  const workflow = /^(W\d+)-/.exec(file)?.[1] ?? null;
  const sharedNames = SHARED_BY_WORKFLOW[workflow] ?? [];
  const shared = sharedNames
    .map((name) => `${readFileSync(path.join(SRC, name), "utf8")}\n`)
    .join("");
  const target = path.join(OUT, file);
  writeFileSync(
    target,
    await format(
      `(async () => {\n${prelude}\n${shared}${readFileSync(path.join(SRC, file), "utf8")}\n})()\n`,
      { ...(await resolveConfig(target)), parser: "babel", filepath: target },
    ),
  );
  n += 1;
}
console.log(`built ${n} proposals`);
