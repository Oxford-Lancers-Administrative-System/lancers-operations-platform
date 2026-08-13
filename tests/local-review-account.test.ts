// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  LOCAL_REVIEW_EMAIL,
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

  it("refuses missing, malformed, and over-permissive credential state", () => {
    const { repo, env } = fixture();
    expect(() => readLocalReviewAccount(repo, env)).toThrow(/agent must restore it/i);

    const location = writeLocalReviewAccount(repo, "local-test-password-123", env);
    fs.chmodSync(location, 0o644);
    expect(() => readLocalReviewAccount(repo, env)).toThrow(/unsafe permissions/i);

    fs.writeFileSync(location, JSON.stringify({ email: "wrong@example.test", password: "x" }), {
      mode: 0o600,
    });
    expect(() => readLocalReviewAccount(repo, env)).toThrow(/invalid/i);
  });
});
