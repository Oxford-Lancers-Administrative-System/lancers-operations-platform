import fs from "node:fs";
import path from "node:path";
import { coordinatorPaths } from "./local-supabase-coordinator.mjs";

export const LOCAL_REVIEW_EMAIL = "brian.daniel.schuster@gmail.com";

/**
 * The second local review login — LAN-110's coaching assignment.
 *
 * Plus-addressing on the same mailbox, so it is the same person, needs no new
 * address and is unmistakably a review account. It is **local only**: nothing
 * creates it on hosted, and the coach seat on hosted is Brian's to grant
 * through the supported administrative path.
 *
 * It shares the protected machine-local password rather than having one of its
 * own — one secret, one file, mode 0600, and nothing extra to leak.
 */
export const LOCAL_REVIEW_COACH_EMAIL = "brian.daniel.schuster+coach@gmail.com";

export function reviewAccountPath(repoPath, env = process.env) {
  return path.join(coordinatorPaths(repoPath, env).root, "review-account.json");
}

export function readLocalReviewAccount(repoPath, env = process.env) {
  const credentialPath = reviewAccountPath(repoPath, env);
  let account;
  try {
    account = JSON.parse(fs.readFileSync(credentialPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        "The protected machine-local review account is not initialized. The issue agent must restore it; do not ask Brian to run a command.",
      );
    }
    throw error;
  }
  if (account.email !== LOCAL_REVIEW_EMAIL || typeof account.password !== "string")
    throw new Error("The protected machine-local review account is invalid.");
  const mode = fs.statSync(credentialPath).mode & 0o777;
  if (mode !== 0o600)
    throw new Error("The protected machine-local review account must have mode 0600.");
  return account;
}

export function ensureLocalReviewAccount(repoPath, env = process.env) {
  try {
    return readLocalReviewAccount(repoPath, env);
  } catch (error) {
    if (!/not initialized/.test(error.message)) throw error;
  }
  const password = env.LANCERS_LOCAL_REVIEW_PASSWORD;
  if (!password)
    throw new Error(
      "The protected machine-local review account is not initialized. The issue agent must restore it from its private owner-approved credential context; do not ask Brian to run a command.",
    );
  writeLocalReviewAccount(repoPath, password, env);
  delete env.LANCERS_LOCAL_REVIEW_PASSWORD;
  return readLocalReviewAccount(repoPath, env);
}

export function writeLocalReviewAccount(repoPath, password, env = process.env) {
  if (typeof password !== "string" || password.length < 8)
    throw new Error("The local review password must contain at least 8 characters.");
  const credentialPath = reviewAccountPath(repoPath, env);
  fs.mkdirSync(path.dirname(credentialPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(credentialPath, `${JSON.stringify({ email: LOCAL_REVIEW_EMAIL, password })}\n`, {
    mode: 0o600,
  });
  fs.chmodSync(credentialPath, 0o600);
  return credentialPath;
}
