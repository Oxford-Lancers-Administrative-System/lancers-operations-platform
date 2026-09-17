#!/usr/bin/env node
/**
 * Copies pdf.js's worker and standard fonts into `public/pdfjs/` — LAN-363.
 *
 * The Code of Conduct step renders its PDF with pdf.js, which needs two things
 * served from this origin: the worker it runs the parser in, and the standard
 * font programs it substitutes for Helvetica and friends. Both are shipped
 * inside `pdfjs-dist`, and both are large binaries that would go stale the
 * moment the dependency moved if they were committed here.
 *
 * So they are copied at build time and at `next dev` start (`prebuild` and
 * `predev`), into a gitignored directory. `npm ci` installs the exact version
 * the lockfile names, and this copies exactly that version's files, so the
 * worker can never disagree with the library that loads it.
 *
 * The Dockerfile copies `/app/public` out of the builder stage, which runs
 * `npm run build`, so the deployed image carries them too.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "public", "pdfjs");

const packageRoot = dirname(require.resolve("pdfjs-dist/package.json"));
const worker = join(packageRoot, "build", "pdf.worker.min.mjs");
const fonts = join(packageRoot, "standard_fonts");

if (!existsSync(worker) || !existsSync(fonts)) {
  console.error(`pdfjs-dist does not carry ${worker} and ${fonts}. Run npm ci, then this again.`);
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(worker, join(target, "pdf.worker.min.mjs"));
cpSync(fonts, join(target, "standard_fonts"), { recursive: true });

console.log(`Copied pdf.js worker and standard fonts to ${target}`);
