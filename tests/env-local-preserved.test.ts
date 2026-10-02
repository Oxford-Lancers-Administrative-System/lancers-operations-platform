import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mergeEnvLocal, writeEnvLocal } from "../scripts/lib/env-local.mjs";

/**
 * `.env.local` keeps what was put there by hand.
 *
 * On 28 September 2026 `db:start` rewrote the file from its own nine lines and
 * erased `AGENT_READONLY_PASSWORD`, which stopped every production read. A
 * fence, in `unit` on purpose: it must run on every pull request.
 */

const GENERATED = [
  "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321",
  "SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  "PORT=3000",
];

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true });
});

function temporaryEnvFile(contents: string | null): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "env-local-"));
  directories.push(directory);
  const file = path.join(directory, ".env.local");
  if (contents !== null) fs.writeFileSync(file, contents);
  return file;
}

describe("mergeEnvLocal", () => {
  it("keeps a hand-added line the caller does not generate", () => {
    const merged = mergeEnvLocal(
      "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:59999\nAGENT_READONLY_PASSWORD=kept-value\n",
      GENERATED,
    );
    expect(merged).toContain("AGENT_READONLY_PASSWORD=kept-value\n");
  });

  it("replaces the caller's own lines and never leaves a stale copy", () => {
    const merged = mergeEnvLocal("PORT=3010\nexport SUPABASE_DB_URL=stale\n", GENERATED);
    expect(merged.match(/^PORT=/gm)).toHaveLength(1);
    expect(merged).toContain("PORT=3000\n");
    expect(merged).not.toContain("stale");
  });

  it("keeps comments and the order of everything it does not own", () => {
    const merged = mergeEnvLocal("# mine\nFIRST=1\nPORT=3010\nSECOND=2\n", GENERATED);
    expect(merged.split("\n").slice(GENERATED.length)).toEqual([
      "# mine",
      "FIRST=1",
      "SECOND=2",
      "",
    ]);
  });

  it("is stable: merging twice changes nothing", () => {
    const once = mergeEnvLocal("AGENT_READONLY_PASSWORD=kept-value\n", GENERATED);
    expect(mergeEnvLocal(once, GENERATED)).toBe(once);
  });

  it("writes only the generated lines when there was no file", () => {
    expect(mergeEnvLocal("", GENERATED)).toBe(`${GENERATED.join("\n")}\n`);
  });
});

describe("writeEnvLocal", () => {
  it("rewrites the file in place with the hand-added line intact, mode 0600", () => {
    const file = temporaryEnvFile("PORT=3010\nAGENT_READONLY_PASSWORD=kept-value\n");
    writeEnvLocal(file, GENERATED);
    const written = fs.readFileSync(file, "utf8");
    expect(written).toContain("AGENT_READONLY_PASSWORD=kept-value\n");
    expect(written).toContain("PORT=3000\n");
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  it("creates the file when it does not exist", () => {
    const file = temporaryEnvFile(null);
    writeEnvLocal(file, GENERATED);
    expect(fs.readFileSync(file, "utf8")).toBe(`${GENERATED.join("\n")}\n`);
  });
});

describe("the start command", () => {
  it("writes .env.local through writeEnvLocal and nowhere else", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "..", "scripts", "local-supabase-command.mjs"),
      "utf8",
    );
    expect(source).toContain('writeEnvLocal(path.join(repoPath, ".env.local")');
    expect(source).not.toMatch(/writeFileSync\([^)]*\.env\.local/);
  });
});
