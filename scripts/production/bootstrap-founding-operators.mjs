#!/usr/bin/env node
/**
 * The one-time founding-operator bootstrap — LAN-135, mission
 * M-OPERATOR-ADMIN-WITHOUT-SQL, `REQ-one-time-bootstrap`.
 *
 * **This is an owner-run production procedure. Brian runs it, by hand. No agent
 * runs it, no workflow runs it, and nothing under `supabase/`, `src/`,
 * `.github/workflows/` or the Dockerfile may reference it.**
 * `tests/production-smoke-contract.test.ts` enforces that for the whole
 * directory and `tests/production-bootstrap-contract.test.ts` proves this
 * script's behaviour against the disposable local stack.
 *
 * ## What it is for
 *
 * It is the moment the mission's premise becomes true. Until it has run, the
 * club has no administrators, so nobody can invite one — the application's
 * every administration path asks who is asking, and the honest answer is
 * "nobody". After it has run, the club has a President, a General Manager and
 * an IT Officer, they were established through the same tables and the same
 * audit ledger every later change uses, and **any later manual SQL provisioning
 * touch is a defect**. That last sentence is the requirement's, and it is the
 * reason this script exists rather than a `psql` session.
 *
 * ## Its four promises
 *
 *   1. **Idempotent.** Every step is keyed on something already unique —
 *      `operator_accounts.login_email`, a Person identifier, a role assignment
 *      that has not ended. A second run finds all of it and writes nothing.
 *   2. **Dry run first, and the dry run writes nothing.** That is the default:
 *      running it with no mode flag previews and stops. It is not a promise the
 *      code merely intends to keep, either — the dry run takes a fingerprint of
 *      every table it could write to before and after itself, and reports a
 *      failure if they differ.
 *   3. **Duplicate-checked.** Existing Person, operator-account and Supabase
 *      Auth state are all read before anything is decided, and a Person who
 *      might already be one of the three refuses the run rather than being
 *      guessed at. See `bootstrap/plan.mjs`.
 *   4. **Fail closed.** One conflict anywhere refuses the whole run. Nothing is
 *      partially applied, ever.
 *
 * ## Auth is the administrative API, never SQL
 *
 * `REQ-one-time-bootstrap` says the bootstrap uses "the Supabase administrative
 * API rather than direct SQL insertion into Auth-owned tables", and that is
 * structural here: `bootstrap/identity.mjs` speaks HTTP to GoTrue and
 * `bootstrap/database.mjs` touches only `public`. Neither can reach the other's
 * territory. See `bootstrap/identity.mjs` for why it matters.
 *
 * ## The identities are never in this repository
 *
 * The exact names and personal email addresses arrive in a JSON file Brian
 * writes outside the repository and deletes afterwards. Nothing in
 * `scripts/production/` contains a name or an address, nothing is defaulted,
 * and nothing is passed on the command line where shell history would keep it.
 * The preview prints them, to Brian's terminal, because checking them is its
 * whole purpose — and this script opens no log file of its own.
 *
 * ## Running it
 *
 * A local rehearsal, against the disposable stack — no confirmation needed,
 * because the loopback check refuses anything else:
 *
 *   node scripts/production/bootstrap-founding-operators.mjs \
 *     --manifest ~/founding-operators.json
 *
 * The hosted run, which is Brian's alone. `docs/migration-runbook.md` and
 * `scripts/production/README.md` carry the full procedure:
 *
 *   DATABASE_URL="…" SUPABASE_URL="…" SUPABASE_SECRET_KEY="…" \
 *     node scripts/production/bootstrap-founding-operators.mjs \
 *       --manifest ~/founding-operators.json \
 *       --app-base-url https://… \
 *       --confirm-target fggbgeraiadetyiyjlvb --apply
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import pg from "pg";

import {
  invitationDeliveryFailedRow,
  invitationResentRow,
  operatorInvitedRow,
  roleAssignedRow,
} from "./bootstrap/audit.mjs";
import {
  applyOperator,
  fingerprint,
  observeOperator,
  recordInvitationOutcome,
} from "./bootstrap/database.mjs";
import { assertIdentityTarget, supabaseIdentity } from "./bootstrap/identity.mjs";
import { ManifestRefused, parseManifest } from "./bootstrap/manifest.mjs";
import { APPLY, describePlan, DRY_RUN, planBootstrap } from "./bootstrap/plan.mjs";
import { PRODUCTION_PROJECT_REF } from "./connection-smoke-test.mjs";
import { resolveTarget } from "./showcase/target.mjs";

/**
 * The route an emailed invitation link enters through, restated.
 *
 * `INVITATION_CALLBACK_PATH` in `src/lib/auth/invitation.ts` is the authority
 * and this is a copy, for the reason every copy in this directory exists: a
 * `.mjs` operator script cannot import a TypeScript module that ships in the
 * container. `tests/production-bootstrap-contract.test.ts` pins the two
 * together, so a change to the route fails a test rather than sending three
 * founding administrators to a page that does not exist.
 */
export const INVITATION_CALLBACK_PATH = "/auth/invitation";

/** The audit rows a run writes. Injectable so a test can capture them. */
export const DEFAULT_AUDIT_ROWS = Object.freeze({
  operatorInvited: operatorInvitedRow,
  roleAssigned: roleAssignedRow,
  invitationResent: invitationResentRow,
  invitationDeliveryFailed: invitationDeliveryFailedRow,
});

/** A refusal that stopped the run. Carries a rule a test can match on. */
export class BootstrapRefused extends Error {
  constructor(message, rule) {
    super(message);
    this.name = "BootstrapRefused";
    this.rule = rule;
  }
}

/**
 * Refuses to run inside CI or a test runner.
 *
 * The same guard `connection-smoke-test.mjs` applies, and for the same reason:
 * this directory is allowed to open a hosted database, and "allowed" must not
 * decay into "reachable from `npm test`". The contract test drives
 * {@link runBootstrap} directly against the local stack instead, which is the
 * engine without the entry point.
 */
export function assertOwnerShell(env = process.env) {
  if (env.CI === "true" || env.VITEST || env.NODE_ENV === "test") {
    throw new BootstrapRefused(
      "Refusing to run inside CI or a test runner. This is an owner-run production procedure.",
      "not_an_owner_shell",
    );
  }
}

/**
 * Reads the command line.
 *
 * `--apply` is opt-in and everything else defaults to the safe answer, which is
 * the whole shape of this script: the dangerous thing is the one you have to
 * ask for.
 */
export function parseArguments(argv) {
  const value = (flag) => {
    const index = argv.indexOf(flag);
    return index === -1 ? null : (argv[index + 1] ?? null);
  };

  const manifestPath = value("--manifest");
  if (!manifestPath || manifestPath.startsWith("--")) {
    throw new BootstrapRefused(
      "Name the manifest: --manifest <path to the JSON file with the founding operators>. " +
        "It is not in this repository and must not be put in it.",
      "manifest_path_required",
    );
  }

  const appBaseUrl = value("--app-base-url");
  if (appBaseUrl !== null) {
    let parsed;
    try {
      parsed = new URL(appBaseUrl);
    } catch {
      throw new BootstrapRefused("--app-base-url is not a URL.", "app_base_url_invalid");
    }
    if (parsed.protocol !== "https:" && !isLoopbackHost(parsed.hostname)) {
      // A credential-establishing link is the last email in this application
      // worth sending over plain HTTP.
      throw new BootstrapRefused(
        "--app-base-url must be https, except on this machine.",
        "app_base_url_insecure",
      );
    }
  }

  return {
    manifestPath,
    mode: argv.includes("--apply") ? APPLY : DRY_RUN,
    resend: argv.includes("--resend"),
    appBaseUrl,
    callbackUrl: appBaseUrl === null ? null : new URL(INVITATION_CALLBACK_PATH, appBaseUrl).href,
  };
}

function isLoopbackHost(hostname) {
  const host = hostname.toLowerCase();
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host) || host.endsWith(".localhost");
}

/** Reads and checks the manifest file. Never echoes its contents on failure. */
export function readManifest(manifestPath) {
  let contents;
  try {
    contents = readFileSync(manifestPath, "utf8");
  } catch {
    throw new BootstrapRefused(
      `The manifest could not be read at ${manifestPath}.`,
      "manifest_not_readable",
    );
  }

  let raw;
  try {
    raw = JSON.parse(contents);
  } catch {
    // Deliberately does not echo the parse error, which quotes the file.
    throw new BootstrapRefused("The manifest is not valid JSON.", "manifest_not_json");
  }

  return parseManifest(raw);
}

/**
 * The bootstrap itself, against an already-connected client and an identity
 * port.
 *
 * Exported so the contract test runs this exact sequence against local
 * Supabase. Returns a report rather than printing, so the test asserts on
 * values and the caller decides what to show a human.
 */
export async function runBootstrap({
  client,
  identity,
  manifest,
  mode = DRY_RUN,
  resend = false,
  callbackUrl = null,
  runId = randomUUID(),
  auditRows = DEFAULT_AUDIT_ROWS,
}) {
  const before = await fingerprint(client);

  // Observed together, in one pass, so the plan describes one moment.
  const observations = [];
  for (const entry of manifest.operators) {
    observations.push(await observeOperator(client, entry, identity));
  }

  const plan = planBootstrap(manifest, observations, { resend });

  if (mode !== APPLY) {
    // The promise, checked rather than asserted. Reading is not writing, and
    // this proves it for the run that just happened rather than for the code
    // in general.
    const after = await fingerprint(client);
    const wroteNothing = JSON.stringify(before) === JSON.stringify(after);

    return {
      mode: DRY_RUN,
      runId,
      plan,
      applied: [],
      invitations: [],
      before,
      after,
      wroteNothing,
    };
  }

  if (!plan.clean) {
    throw new BootstrapRefused(
      `Refusing to apply: ${plan.conflicts.length} conflict(s). Nothing was written.`,
      "plan_has_conflicts",
    );
  }

  const willSend = plan.entries.some((planned) => planned.invitation.action === "send");
  if (willSend && !callbackUrl) {
    throw new BootstrapRefused(
      "An invitation would be sent and there is nowhere for its link to land. " +
        "Pass --app-base-url <the application's public origin>.",
      "callback_url_required",
    );
  }

  const applied = [];
  for (const [index, planned] of plan.entries.entries()) {
    const observed = observations[index];
    const correlationId = randomUUID();

    const result = await applyOperator(client, planned, {
      identity,
      auditRows,
      runId,
      correlationId,
      operatingYear: observed.operatingYear,
      roleRow: observed.role,
    });

    applied.push({ planned, correlationId, ...result });
  }

  // The email, last, and after everything is committed. A failure here is a
  // recorded delivery failure against an operator who exists — never a rollback
  // of the operator.
  const invitations = [];
  for (const [index, planned] of plan.entries.entries()) {
    if (planned.invitation.action !== "send") continue;

    const record = applied[index];
    const outcomeContext = {
      auditRows,
      runId,
      correlationId: record.correlationId,
      operatingYear: observations[index].operatingYear,
    };

    try {
      await identity.sendInvitation(planned.entry.email, callbackUrl);
      await recordInvitationOutcome(
        client,
        {
          ok: true,
          resent: planned.login.action === "existing",
          personId: record.personId,
          operatorAccountId: record.operatorAccountId,
        },
        outcomeContext,
      );
      invitations.push({ roleCode: planned.entry.roleCode, ok: true, reason: null });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await recordInvitationOutcome(
        client,
        {
          ok: false,
          personId: record.personId,
          operatorAccountId: record.operatorAccountId,
          reason,
        },
        outcomeContext,
      );
      invitations.push({ roleCode: planned.entry.roleCode, ok: false, reason });
    }
  }

  const after = await fingerprint(client);
  return { mode: APPLY, runId, plan, applied, invitations, before, after, wroteNothing: false };
}

async function main() {
  assertOwnerShell();

  const argv = process.argv.slice(2);
  const options = parseArguments(argv);
  const manifest = readManifest(options.manifestPath);

  const target = resolveTarget(argv);
  const identityTarget = assertIdentityTarget(target);
  const identity = supabaseIdentity(identityTarget);

  console.log(`Database  ${target.describe()}`);
  console.log(`Auth      ${identityTarget.describe()}`);
  console.log(
    "\nThe preview below contains personal names and email addresses. It is for your " +
      "terminal only — do not paste it into a ticket, a pull request or a prompt.\n",
  );

  const client = new pg.Client({ connectionString: target.connectionString });
  await client.connect();

  try {
    const report = await runBootstrap({
      client,
      identity,
      manifest,
      mode: options.mode,
      resend: options.resend,
      callbackUrl: options.callbackUrl,
    });

    for (const line of describePlan(report.plan, { mode: report.mode })) console.log(line);

    if (report.mode === DRY_RUN) {
      if (!report.wroteNothing) {
        console.error(
          "FAIL  The dry run observed the database change while it was reading it. " +
            "Something else is writing to this database; do not apply.",
        );
        process.exitCode = 1;
        return;
      }
      console.log("The dry run wrote nothing — checked, not assumed.");
      if (!report.plan.clean) process.exitCode = 1;
      else if (!report.plan.settled) {
        console.log("\nRe-run with --apply to make these changes.");
      }
      return;
    }

    for (const invitation of report.invitations) {
      console.log(
        invitation.ok
          ? `SENT      invitation for ${invitation.roleCode}`
          : `NOT SENT  invitation for ${invitation.roleCode} — ${invitation.reason}`,
      );
    }

    const undelivered = report.invitations.filter((invitation) => !invitation.ok);
    if (undelivered.length > 0) {
      console.error(
        `\n${undelivered.length} invitation(s) were not delivered. The operators exist and are ` +
          "recorded as Delivery failed. Fix the mail configuration and re-run with --resend.",
      );
      process.exitCode = 1;
      return;
    }

    console.log(
      "\nDone. The founding operators are established. From here every further change is " +
        "made in the application — a manual SQL provisioning touch after this point is a defect.",
    );
  } finally {
    await client.end();
  }
}

// Only when run directly. Importing this module — which the contract test does —
// must never open a connection or read the command line.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    await main();
  } catch (error) {
    if (error instanceof BootstrapRefused || error instanceof ManifestRefused) {
      console.error(`REFUSED  [${error.rule}] ${error.message}`);
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}

export { APPLY, DRY_RUN, PRODUCTION_PROJECT_REF };
