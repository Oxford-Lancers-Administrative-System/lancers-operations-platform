/**
 * Which database the showcase loader is pointed at, and how it refuses to be
 * pointed at the wrong one — LAN-124.
 *
 * ## Two targets, deliberately asymmetric
 *
 * **Local.** The default. A loopback database, from `.env.local` or an explicit
 * `--database-url`, and refused if it is not loopback. This is how the loader is
 * developed, how its tests run, and how the owner runbook is rehearsed before
 * anybody points it at anything real. Nothing about running it here is
 * dangerous, so nothing about running it here is ceremonious.
 *
 * **Hosted.** Requires `--confirm-target <project-ref>` *and* `DATABASE_URL`,
 * and both are checked by the functions the connection smoke test already
 * exports. Those are imported rather than re-implemented: `tests/production-
 * smoke-contract.test.ts` pins them against `src/lib/db/runtime-target.ts`, so
 * a second copy here would be a second thing to keep in step and the first one
 * to drift. The asymmetry is the point — the safe target is the default and the
 * dangerous one has to be named out loud.
 *
 * ## What this file does not do
 *
 * It does not read `scripts/lib/local-db.mjs`. That module refuses every
 * non-loopback database unconditionally and must keep refusing — ADR 0001 and
 * ADR 0026 both turn on it staying that way. A loader that imported it and then
 * needed a hosted branch would have to weaken it, so it has its own connection
 * instead and leaves that guard alone.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertApprovedTarget,
  assertExplicitProductionTarget,
  PRODUCTION_PROJECT_REF,
} from "../connection-smoke-test.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../..");

/** Hostnames that are this machine and cannot be anybody's production. */
const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Is this connection string pointed at this machine?
 *
 * Parsed rather than pattern-matched, for the reason `isLoopbackBaseUrl` gives
 * in the delivery configuration: `postgres://user@localhost.example.com/db`
 * contains the string "localhost" and is emphatically not loopback.
 */
export function isLoopbackDatabaseUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return LOOPBACK.has(hostname) || hostname.endsWith(".localhost");
  } catch {
    return false;
  }
}

/** Reads one variable out of `.env.local`, without pulling in a dotenv parser. */
function fromEnvLocal(name) {
  let contents;
  try {
    contents = readFileSync(path.join(REPO_ROOT, ".env.local"), "utf8");
  } catch {
    return null;
  }

  for (const line of contents.split(/\r?\n/)) {
    const match = new RegExp(`^\\s*${name}\\s*=\\s*(.*)$`).exec(line);
    if (!match) continue;
    const value = match[1].trim().replace(/^["']|["']$/g, "");
    if (value !== "") return value;
  }
  return null;
}

/**
 * Resolves the target from the command line and the environment.
 *
 * Returns `{ kind, connectionString, describe }`, where `describe` is safe to
 * print: it names the host and database and never the password. Nothing in this
 * file ever logs `connectionString` itself.
 */
export function resolveTarget(argv = process.argv.slice(2), env = process.env) {
  const confirmedIndex = argv.indexOf("--confirm-target");

  if (confirmedIndex !== -1) {
    // Hosted. Both guards, in the order the smoke test applies them: the human
    // named the project, and the string really is that project.
    assertExplicitProductionTarget(argv, env);
    const connectionString = assertApprovedTarget(env.DATABASE_URL);

    return {
      kind: "hosted",
      connectionString,
      describe: () => `hosted project ${PRODUCTION_PROJECT_REF}`,
    };
  }

  const explicitIndex = argv.indexOf("--database-url");
  // `SUPABASE_DB_URL` is the name the local stack actually writes into
  // `.env.local` — the coordinator generates it — so it is read before the
  // generic one. A rehearsal that silently found no database and asked for
  // `--confirm-target` would be a confusing way to learn that.
  const connectionString =
    (explicitIndex === -1 ? null : argv[explicitIndex + 1]) ??
    env.SHOWCASE_DATABASE_URL ??
    env.DATABASE_URL ??
    fromEnvLocal("SUPABASE_DB_URL") ??
    fromEnvLocal("DATABASE_URL");

  if (!connectionString) {
    throw new Error(
      "No database to work against. Either set DATABASE_URL in .env.local for a local run, " +
        `or name the hosted project explicitly with --confirm-target ${PRODUCTION_PROJECT_REF}.`,
    );
  }

  if (!isLoopbackDatabaseUrl(connectionString)) {
    // The whole reason a local run needs no ceremony is that it cannot reach
    // anything real. A non-loopback string arriving without `--confirm-target`
    // is somebody about to do something they have not said out loud.
    throw new Error(
      "Refusing a database that is not on this machine without an explicit target. " +
        `A hosted run is: --confirm-target ${PRODUCTION_PROJECT_REF}, with DATABASE_URL set.`,
    );
  }

  let described;
  try {
    const parsed = new URL(connectionString);
    described = `local database ${parsed.hostname}:${parsed.port || "5432"}${parsed.pathname}`;
  } catch {
    described = "local database";
  }

  return { kind: "local", connectionString, describe: () => described };
}
