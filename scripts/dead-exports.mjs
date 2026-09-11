#!/usr/bin/env node
// LAN-303: exports under `src/` (outside the carve-outs) that no non-test, non-preview source
// file names. knip cannot see through `export *` barrels, so this is the production-only view.
// Usage: `npm run dead-exports`. Framework entry files and the design preview are skipped.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";
const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const CARVE = [
  "src/lib/auth/",
  "src/lib/db/",
  "src/lib/supabase/",
  "src/proxy.ts",
  "src/lib/rsvp/",
  "src/lib/services/rsvp-tokens.ts",
  "src/lib/services/player-answer-tokens.ts",
  "src/lib/services/delivery.ts",
  "src/lib/services/messaging-scheduler.ts",
  "src/lib/delivery/",
];
function* walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(e)) yield p;
  }
}
const files = [];
for (const p of walk(join(ROOT, "src"))) {
  const rel = relative(ROOT, p);
  if (/\.test\.tsx?$/.test(rel) || rel.endsWith("database.types.ts")) continue;
  files.push({ rel, src: readFileSync(p, "utf8") });
}
const ids = new Map();
const exportsOf = new Map();
for (const f of files) {
  const sf = ts.createSourceFile(
    f.rel,
    f.src,
    ts.ScriptTarget.Latest,
    true,
    /\.tsx$/.test(f.rel) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const set = new Map();
  const ex = [];
  const visit = (n) => {
    if (ts.isIdentifier(n)) set.set(n.text, (set.get(n.text) ?? 0) + 1);
    const mods = ts.canHaveModifiers(n) ? ts.getModifiers(n) : undefined;
    const isExport = mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (isExport) {
      const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
      const size =
        sf.getLineAndCharacterOfPosition(n.getEnd()).line -
        sf.getLineAndCharacterOfPosition(n.getStart(sf)).line +
        1;
      if (
        (ts.isFunctionDeclaration(n) ||
          ts.isClassDeclaration(n) ||
          ts.isInterfaceDeclaration(n) ||
          ts.isTypeAliasDeclaration(n) ||
          ts.isEnumDeclaration(n)) &&
        n.name
      )
        ex.push({ name: n.name.text, kind: ts.SyntaxKind[n.kind], line, size });
      if (ts.isVariableStatement(n))
        for (const d of n.declarationList.declarations) {
          if (ts.isIdentifier(d.name)) ex.push({ name: d.name.text, kind: "Variable", line, size });
        }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  ids.set(f.rel, set);
  exportsOf.set(f.rel, ex);
}
const isPreview = (r) => r.startsWith("src/app/design-preview/");
const rows = [];
for (const [rel, ex] of exportsOf) {
  if (CARVE.some((c) => rel.startsWith(c))) continue;
  if (isPreview(rel)) continue;
  if (
    /\/(page|layout|template|error|loading|not-found|route|opengraph-image|twitter-image|manifest|default)\.tsx?$/.test(
      rel,
    )
  )
    continue;
  for (const e of ex) {
    let prod = 0,
      preview = 0;
    for (const [other, set] of ids) {
      if (other === rel) continue;
      if (!set.has(e.name)) continue;
      if (isPreview(other)) preview++;
      else prod++;
    }
    if (prod === 0)
      rows.push({ ...e, file: rel, preview, ownUses: (ids.get(rel).get(e.name) ?? 1) - 1 });
  }
}
rows.sort((a, b) => b.size - a.size);
let total = 0;
for (const r of rows) total += r.size;
const unref = rows.filter((r) => r.ownUses === 0);
console.log(
  `${rows.length} exports in ${new Set(rows.map((r) => r.file)).size} files are named by no non-test, non-preview file (declaration spans ${total} lines); ${unref.length} of them are not used inside their own file either (${unref.reduce((t, r) => t + r.size, 0)} lines)`,
);
for (const r of rows)
  console.log(
    `${String(r.size).padStart(4)}  ${r.kind.padEnd(20)} ${r.name.padEnd(40)} ${r.file}:${r.line}  ${r.ownUses > 0 ? "own-file" : "unreferenced"}${r.preview ? "  (preview only)" : ""}`,
  );
