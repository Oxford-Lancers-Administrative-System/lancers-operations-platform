// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
  LOCAL_REVIEW_EMAIL,
  ensureLocalReviewAccount,
  readLocalReviewAccount,
  reviewAccountPath,
  writeLocalReviewAccount,
} from "../scripts/lib/local-review-account.mjs";

const roots: string[] = [];

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lancers-review-account-"));
  roots.push(root);
  const repo = path.join(root, "repo");
  fs.mkdirSync(repo);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    LANCERS_COORDINATOR_ROOT: path.join(root, "shared"),
  };
  return { repo, env };
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("protected local review account", () => {
  it("stores the fixed email and supplied password only in shared mode-0600 state", () => {
    const { repo, env } = fixture();
    const password = "local-test-password-123";
    const location = writeLocalReviewAccount(repo, password, env);

    expect(location).toBe(reviewAccountPath(repo, env));
    expect(location.startsWith(env.LANCERS_COORDINATOR_ROOT!)).toBe(true);
    expect(location.startsWith(repo)).toBe(false);
    expect(fs.statSync(location).mode & 0o777).toBe(0o600);
    expect(readLocalReviewAccount(repo, env)).toEqual({
      email: LOCAL_REVIEW_EMAIL,
      password,
    });
  });

  it("initializes clean shared state from private process context without returning the path", () => {
    const { repo, env } = fixture();
    const password = "local-test-password-123";
    expect(
      ensureLocalReviewAccount(repo, { ...env, LANCERS_LOCAL_REVIEW_PASSWORD: password }),
    ).toEqual({ email: LOCAL_REVIEW_EMAIL, password });
    expect(fs.statSync(reviewAccountPath(repo, env)).mode & 0o777).toBe(0o600);
  });

  it("bootstraps clean state in a silent separate process", () => {
    const { repo, env } = fixture();
    const moduleUrl = new URL("../scripts/lib/local-review-account.mjs", import.meta.url).href;
    const program = `import {ensureLocalReviewAccount} from ${JSON.stringify(moduleUrl)}; ensureLocalReviewAccount(process.argv[1]);`;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", program, repo], {
      encoding: "utf8",
      env: { ...env, LANCERS_LOCAL_REVIEW_PASSWORD: "local-test-password-123" },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    expect(readLocalReviewAccount(repo, env).email).toBe(LOCAL_REVIEW_EMAIL);
  });

  it("refuses missing, malformed, and every non-0600 credential mode", () => {
    const { repo, env } = fixture();
    expect(() => readLocalReviewAccount(repo, env)).toThrow(/agent must restore it/i);
    expect(() => ensureLocalReviewAccount(repo, env)).toThrow(/private owner-approved/i);

    const location = writeLocalReviewAccount(repo, "local-test-password-123", env);
    for (const mode of [0o400, 0o620, 0o640, 0o604, 0o644]) {
      fs.chmodSync(location, mode);
      expect(() => readLocalReviewAccount(repo, env), `mode ${mode.toString(8)}`).toThrow(/0600/i);
    }

    fs.chmodSync(location, 0o600);
    fs.writeFileSync(location, JSON.stringify({ email: "wrong@example.test", password: "x" }), {
      mode: 0o600,
    });
    expect(() => readLocalReviewAccount(repo, env)).toThrow(/invalid/i);
  });
});
