// Build every proposal from the shared prelude plus one screen body.
// Run from the worktree root: node missions/intake/M-RECRUITMENT/mockups/build-proposals.mjs
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import path from "node:path";
const ROOT = "missions/intake/M-RECRUITMENT/mockups";
const SRC = path.join(ROOT, "src");
const OUT = path.join(ROOT, "proposals");
mkdirSync(OUT, { recursive: true });
const prelude = readFileSync(path.join(SRC, "_prelude.js"), "utf8");
let n = 0;
for (const file of readdirSync(SRC).sort()) {
  if (file.startsWith("_") || !file.endsWith(".js")) continue;
  writeFileSync(
    path.join(OUT, file),
    `(() => {\n${prelude}\n${readFileSync(path.join(SRC, file), "utf8")}\n})();\n`,
  );
  n += 1;
}
console.log(`built ${n} proposals`);
