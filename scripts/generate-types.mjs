#!/usr/bin/env node
/**
 * Generates `src/lib/supabase/database.types.ts` from the **local** Supabase
 * schema.
 *
 *   npm run types:generate   # write the file
 *   npm run types:check      # fail if the committed file has drifted
 *
 * The check variant is what makes schema drift detectable: CI resets a database
 * from migrations, regenerates types, and fails if the result differs from what
 * is committed. That catches a migration landing without its types, or types
 * being hand-edited.
 *
 * Types are always generated from local — never from the production project.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(root, "src/lib/supabase/database.types.ts");
const checkOnly = process.argv.includes("--check");

const HEADER = `/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Regenerate with \`npm run types:generate\` against the local Supabase stack.
 * \`npm run types:check\` fails when this file has drifted from the local schema.
 */
`;

function generate() {
  try {
    return execFileSync(
      "supabase",
      ["gen", "types", "typescript", "--local", "--schema", "public"],
      {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message;
    console.error("Failed to generate types from the local Supabase stack.");
    console.error("Is it running? Start it with `npm run db:start`.\n");
    console.error(detail);
    process.exit(1);
  }
}

const generated = HEADER + generate();

if (!checkOnly) {
  writeFileSync(target, generated);
  console.log(`Wrote ${target}`);
  process.exit(0);
}

const current = existsSync(target) ? readFileSync(target, "utf8") : "";

if (current !== generated) {
  console.error("Database types are out of date with the local schema.");
  console.error("Run `npm run types:generate` and commit the result.");
  process.exit(1);
}

console.log("Database types are up to date.");
