import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { coordinatorPaths } from "./local-supabase-coordinator.mjs";

/**
 * The machine-local club-link signing key — LAN-157.
 *
 * `CLUB_LINK_SECRET` signs the club link (D81). A missing value is a refusal
 * rather than a default, and rightly so: a derived-from-nothing key would make
 * links that silently stop working the moment a real one was configured.
 *
 * That refusal is correct for a deployment and wrong for a laptop. The
 * zero-command review handoff means Brian runs no setup commands, so the local
 * stack has to have a key before he opens the page — and asking him to invent
 * one is a command.
 *
 * So one is generated here, once per machine, and kept beside the review
 * account: 32 random bytes, hex, mode 0600, in the coordinator's own state
 * directory rather than in the repository. It is disposable. Losing it means
 * every local club link stops opening, and the fix is to issue another one.
 *
 * **It is not the production key and has no hosted counterpart.** The hosted
 * value lives in Secret Manager and is Brian's to set.
 */
export function clubLinkSecretPath(repoPath, env = process.env) {
  return path.join(coordinatorPaths(repoPath, env).root, "club-link-secret.json");
}

export function ensureLocalClubLinkSecret(repoPath, env = process.env) {
  const secretPath = clubLinkSecretPath(repoPath, env);
  try {
    const stored = JSON.parse(fs.readFileSync(secretPath, "utf8"));
    if (typeof stored.secret === "string" && stored.secret.length >= 32) return stored.secret;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const secret = crypto.randomBytes(32).toString("hex");
  fs.mkdirSync(path.dirname(secretPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(secretPath, `${JSON.stringify({ secret })}\n`, { mode: 0o600 });
  fs.chmodSync(secretPath, 0o600);
  return secret;
}
