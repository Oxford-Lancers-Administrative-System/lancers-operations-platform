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
 * The default local stack, mirroring `DEFAULT_URL` in `scripts/lib/local-db.mjs`.
 *
 * Safe as a default precisely because it is loopback: the check below still
 * applies to it, so this can never become a route to anything hosted.
 */
const LOCAL_DEFAULT_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/**
 * Is this connection string pointed at this machine, and only at this machine?
 *
 * **This is the fourth copy of the loopback rule in this repository, and until
 * LAN-135 it was the weakest of the four and the only one no test referenced.**
 * `src/lib/db/url.ts`, `scripts/lib/local-db.mjs` and `assertApprovedTarget` in
 * `../connection-smoke-test.mjs` all carry it; the first two are pinned against
 * each other by `tests/service-layer-guard-parity.test.ts`, and since LAN-135
 * this one is pinned there too. If you change any of them, change all of them.
 *
 * It now applies the same three refusals, in the same order, for the same
 * reasons:
 *
 *  1. **Not a URL at all** — refused. A malformed connection string is still a
 *     connection string and may still carry a password, so nothing about it is
 *     echoed anywhere.
 *
 *  2. **A query or fragment component** — refused, whatever it contains.
 *     `pg-connection-string` copies query parameters into the client
 *     configuration, where `host`, `port` and `user` override the authority, so
 *
 *         postgresql://postgres:pw@127.0.0.1:5432/postgres?host=db.example.net
 *
 *     reads as loopback here and opens a database somewhere else entirely.
 *     Refusing the whole component closes that without this file having to
 *     track which parameters the driver honours. This was the gap: the loader
 *     that first copied this rule dropped the check, and LAN-135 made the same
 *     function the connection path for the club's founding-operator rows —
 *     which would have printed "local database 127.0.0.1" while writing them
 *     off-machine. Found by independent review of LAN-135 (finding R1).
 *
 *  3. **A host that is not loopback**, matched against the same four-name set
 *     the other three guards use — an exact set, not a suffix rule.
 *     `postgres://user@localhost.example.com/db` contains the string
 *     "localhost" and is emphatically not loopback, and `app.localhost` is
 *     loopback by RFC 6761 convention but is *not* what the other database
 *     guards accept. This file used to accept it and now does not: an origin
 *     rule (`src/lib/auth/recovery.ts`) and a database rule are two different
 *     rules, and the database ones must agree exactly or the parity test is
 *     pinning a fiction.
 *
 * Plus the hosted-Supabase refusal the other two carry, which is unreachable
 * behind the host check today and costs nothing to keep in step.
 *
 * Returns a boolean rather than throwing, because its caller turns a refusal
 * into a sentence about what to do instead. What it must never do is return
 * `true` for something the other three would refuse.
 */
export function isLoopbackDatabaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  if (parsed.search !== "" || parsed.hash !== "") return false;
  if (!LOOPBACK.has(parsed.hostname)) return false;
  if (/supabase\.(co|com|in)/i.test(value) || /pooler/i.test(parsed.hostname)) return false;

  return true;
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
  // `SUPABASE_DB_URL` is the name the local stack uses — the coordinator writes
  // it into `.env.local`, and CI exports it into the environment with no
  // `.env.local` at all. Both are read, environment first, and the loopback
  // default last: that default is `scripts/lib/local-db.mjs`'s, and without it
  // the automated test failed in CI while passing on a developer machine.
  const connectionString =
    (explicitIndex === -1 ? null : argv[explicitIndex + 1]) ??
    env.SHOWCASE_DATABASE_URL ??
    env.SUPABASE_DB_URL ??
    env.DATABASE_URL ??
    fromEnvLocal("SUPABASE_DB_URL") ??
    fromEnvLocal("DATABASE_URL") ??
    LOCAL_DEFAULT_URL;

  if (!connectionString) {
    throw new Error(
      "No database to work against. Either set SUPABASE_DB_URL for a local run, " +
        `or name the hosted project explicitly with --confirm-target ${PRODUCTION_PROJECT_REF}.`,
    );
  }

  if (!isLoopbackDatabaseUrl(connectionString)) {
    // The whole reason a local run needs no ceremony is that it cannot reach
    // anything real. A string that is not loopback — or that carries query
    // parameters able to redirect the driver somewhere that is not — arriving
    // without `--confirm-target` is somebody about to do something they have
    // not said out loud.
    //
    // The message names both causes without quoting the string, which carries
    // a password.
    throw new Error(
      "Refusing a database that is not on this machine, or that carries query or fragment " +
        "parameters able to redirect the driver off it, without an explicit target. " +
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
