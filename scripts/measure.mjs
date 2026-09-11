#!/usr/bin/env node
// LAN-303: the size of the application, measured as non-comment code lines in
// `src/`, excluding tests and the generated Supabase types. A line counts when
// at least one non-comment token sits on it; comment-only and blank lines do
// not. Usage: `npm run measure [-- --by-dir <depth>] [--files <n>] [--json]`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = join(import.meta.dirname, "..");
const SRC = join(ROOT, "src");
const CARVE_OUTS = [
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

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : (args[i + 1] ?? true);
};
const byDir = Number(flag("--by-dir") ?? 0);
const topFiles = Number(flag("--files") ?? 0);
const asJson = args.includes("--json");

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.(ts|tsx)$/.test(entry)) yield path;
  }
}

const isMeasured = (rel) => !/\.test\.tsx?$/.test(rel) && !rel.endsWith("database.types.ts");

export function codeLines(source, fileName) {
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    /\.tsx$/.test(fileName) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const lines = new Set();
  const mark = (node) => {
    if (node.kind === ts.SyntaxKind.EndOfFileToken || ts.isJSDoc(node)) return;
    const children = node.getChildren(sf);
    if (children.length === 0) {
      if (node.kind === ts.SyntaxKind.JsxText && node.text.trim() === "") return;
      const start = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
      const end = sf.getLineAndCharacterOfPosition(node.getEnd()).line;
      for (let line = start; line <= end; line += 1) lines.add(line);
      return;
    }
    for (const child of children) mark(child);
  };
  mark(sf);
  return lines.size;
}

const files = [];
for (const path of walk(SRC)) {
  const rel = relative(ROOT, path);
  if (!isMeasured(rel)) continue;
  files.push({ file: rel, lines: codeLines(readFileSync(path, "utf8"), path) });
}

const sum = (list) => list.reduce((total, f) => total + f.lines, 0);
const carved = files.filter((f) => CARVE_OUTS.some((c) => f.file.startsWith(c)));
const total = sum(files);
const result = {
  total,
  carveOuts: sum(carved),
  reachable: total - sum(carved),
  files: files.length,
};

if (asJson) {
  console.log(JSON.stringify({ ...result, perFile: files }, null, 2));
} else {
  console.log(
    `code lines: ${total} across ${files.length} files (src/, no tests, no generated types)`,
  );
  console.log(`  carve-outs: ${result.carveOuts}    reachable: ${result.reachable}`);
  if (byDir > 0) {
    const groups = new Map();
    for (const f of files) {
      const key = f.file
        .split("/")
        .slice(0, byDir + 1)
        .join("/");
      groups.set(key, (groups.get(key) ?? 0) + f.lines);
    }
    console.log("\nby directory:");
    for (const [dir, lines] of [...groups].sort((a, b) => b[1] - a[1]))
      console.log(`  ${String(lines).padStart(7)}  ${dir}`);
  }
  if (topFiles > 0) {
    console.log(`\nlargest ${topFiles} files:`);
    for (const f of [...files].sort((a, b) => b.lines - a.lines).slice(0, topFiles))
      console.log(`  ${String(f.lines).padStart(7)}  ${f.file}`);
  }
}
