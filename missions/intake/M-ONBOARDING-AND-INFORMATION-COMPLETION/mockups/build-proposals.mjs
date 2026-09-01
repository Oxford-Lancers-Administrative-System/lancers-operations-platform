// Build every proposal from the shared prelude plus one screen body.
// Run from the worktree root:
//   node missions/intake/M-ONBOARDING-AND-INFORMATION-COMPLETION/mockups/build-proposals.mjs
//
// Ported unchanged in shape from M-RECRUITMENT, which established it. The async
// wrapper is the load-bearing part: a proposal may drive the real form — fill
// it, press the application's own button, wait for what it renders — so a
// screen shows shipped behaviour rather than a drawing of it.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import path from "node:path";
import { format, resolveConfig } from "prettier";
const ROOT = "missions/intake/M-ONBOARDING-AND-INFORMATION-COMPLETION/mockups";
const SRC = path.join(ROOT, "src");
const OUT = path.join(ROOT, "proposals");
mkdirSync(OUT, { recursive: true });
const prelude = readFileSync(path.join(SRC, "_prelude.js"), "utf8");
let n = 0;
for (const file of readdirSync(SRC).sort()) {
  if (file.startsWith("_") || !file.endsWith(".js")) continue;
  const target = path.join(OUT, file);
  writeFileSync(
    target,
    await format(
      `(async () => {\n${prelude}\n${readFileSync(path.join(SRC, file), "utf8")}\n})()\n`,
      { ...(await resolveConfig(target)), parser: "babel", filepath: target },
    ),
  );
  n += 1;
}
console.log(`built ${n} proposals`);
