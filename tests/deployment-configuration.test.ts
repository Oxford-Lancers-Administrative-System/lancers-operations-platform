// @vitest-environment node
/**
 * Shipping the code is not the same as turning the feature on.
 *
 * Several features in this repository refuse to run until a deployment names
 * the external service they may talk to. That refusal is deliberate and good —
 * an unconfigured deployment reaches out to nobody, and says so in the
 * operator's own words rather than throwing. Its failure mode is the quiet one:
 * the feature merges, works locally, passes CI, and is never enabled on any
 * deployed revision, because nothing anywhere connects "this code reads
 * `X`" to "the deploy sets `X`".
 *
 * That is not hypothetical. LAN-115's address search merged on 15 August 2026
 * and `deploy.yml` passed Cloud Run exactly one variable — a Secret Manager
 * entry for Supabase — so the deployed venue field would have told every
 * operator that address search was not set up. It was found by walking the
 * slice for LAN-82, by eye, which is not a control.
 *
 * So this file is the missing link. For every provider-style configuration the
 * application refuses to run without, the deploy must **either** set it **or**
 * `docs/deployment.md` must record it as knowingly absent with the issue that
 * owns it. A new one that does neither fails here.
 *
 * No network, no cloud, no credentials: this reads the workflow and the
 * configuration modules as text and compares them.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  EMAIL_ENVIRONMENT_VARIABLES,
  OUTBOUND_ENVIRONMENT_VARIABLES,
  WEBHOOK_ENVIRONMENT_VARIABLES,
} from "@/lib/delivery/config";
import { BASE_URL_VARIABLE, PROVIDER_VARIABLE } from "@/lib/venue-search/config";
import { SCHEDULER_TOKEN_VARIABLE } from "@/app/api/scheduler/messaging/route";

const repoRoot = path.resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(path.join(repoRoot, file), "utf8");

const deploy = read(".github/workflows/deploy.yml");
const deploymentDoc = read("docs/deployment.md");
const envExample = read(".env.example");

/**
 * The deploy's declared configuration, with comments removed.
 *
 * A comment mentioning a variable is not the deploy setting it, and this file
 * exists precisely because the difference between talking about configuration
 * and having it is easy to miss.
 */
const deployCode = deploy
  .split("\n")
  .map((line) => line.replace(/(^|\s)#.*$/, ""))
  .join("\n");

/**
 * Every environment variable the Cloud Run deploy step sets, by name.
 *
 * Read from `--set-env-vars` in the `flags:` block, which is where they are
 * declared and where they must stay. That flag **replaces** the revision's
 * environment rather than adding to it, so a second `--set-env-vars`, or mixing
 * it with the action's `env_vars:` input, would silently leave only whichever
 * ran last — the exact class of failure this file exists to catch. The single
 * declaration is asserted below rather than assumed here.
 */
function configuredVariables(): Set<string> {
  const names = new Set<string>();
  for (const match of deployCode.matchAll(/--set-env-vars=(\S+)/g)) {
    for (const pair of match[1].split(",")) {
      const name = /^([A-Z0-9_]+)=/.exec(pair)?.[1];
      if (name) names.add(name);
    }
  }
  return names;
}

/**
 * Every credential the Cloud Run deploy injects from Secret Manager, by name.
 *
 * Read from the `secrets:` block's own lines, each shaped
 * `NAME=${{ ... }}:latest`. The trailing `:latest` is the anchor — it is the
 * one token that only appears on a `secrets:` line, so this does not have to
 * locate the block by indentation.
 */
function configuredSecrets(): Set<string> {
  const names = new Set<string>();
  for (const match of deployCode.matchAll(/^\s*([A-Z0-9_]+)=.*:latest\s*$/gm)) {
    names.add(match[1]);
  }
  return names;
}

describe("the deploy turns on what the code refuses to run without", () => {
  const configured = configuredVariables();
  const secrets = configuredSecrets();

  it("parses the workflow's environment declaration at all", () => {
    // A parser that silently found nothing would pass every test below by
    // reporting that nothing is configured and nothing needs to be.
    expect(configured.size).toBeGreaterThan(0);
  });

  it("declares the environment exactly once, by any mechanism", () => {
    // `--set-env-vars` replaces the revision's environment. A second one, or any
    // of the action's own environment inputs beside it, means one list quietly
    // wins and the other's variables are simply absent from the revision —
    // which looks exactly like the defect this file was written for.
    //
    // Enumerated rather than spot-checked, because the first version of this
    // test named `env_vars:` alone: review added `env_vars_file:` and all seven
    // tests still passed. Every mechanism that can set or clear a Cloud Run
    // environment is listed here, and a new one is a deliberate edit.
    expect([...deployCode.matchAll(/--set-env-vars[= ]/g)]).toHaveLength(1);
    for (const competing of [
      /^\s*env_vars:/m,
      /^\s*env_vars_file:/m,
      /^\s*env_vars_update_strategy:/m,
      /--update-env-vars[= ]/,
      /--remove-env-vars[= ]/,
      /--clear-env-vars\b/,
    ]) {
      expect(
        deployCode,
        `${competing} sets or clears the environment alongside --set-env-vars, and one of them will lose`,
      ).not.toMatch(competing);
    }
  });

  /**
   * Every variable the deployed revision is REQUIRED to carry, by name.
   *
   * The list is the point. Without it this file asserted only that address
   * search was configured, so deleting `DATABASE_POOL_MAX=5` from the flag left
   * all seven tests passing — shipping the code default of 10 per instance
   * against `--max-instances=3`, which is 30 client connections into a
   * 15-connection pooler and `app_runtime`'s `connection limit 20` (ADR 0026).
   * A failure visible only under production concurrency, from a one-line edit,
   * with a green suite. Review found it by injection.
   *
   * A variable belongs here when a revision without it is wrong — not merely
   * different. Adding one is a deliberate edit and so is removing one.
   */
  const REQUIRED_ON_EVERY_REVISION: readonly (readonly [name: string, why: string])[] = [
    [
      "DATABASE_POOL_MAX",
      "the code default of 10 per instance is 30 connections against a 15-connection pooler (ADR 0026)",
    ],
    [
      PROVIDER_VARIABLE,
      "the deployed venue field tells operators that address search is not set up",
    ],
    [
      "APP_BASE_URL",
      "password recovery has no trusted origin to build a link from and silently sends nobody anything (LAN-125)",
    ],
    [
      "WHATSAPP_PHONE_NUMBER_ID",
      "the sender has no phone number to send from and approval delivers nothing (LAN-168 item 0)",
    ],
    [
      "WHATSAPP_TEMPLATE_NAME",
      "the sender has no approved template to send and approval delivers nothing (LAN-168 item 0, LAN-348)",
    ],
    [
      "EMAIL_FROM_ADDRESS",
      "the email fallback has no verified sending identity and refuses (LAN-168 item 0, LAN-169)",
    ],
  ];

  it.each(REQUIRED_ON_EVERY_REVISION)("sets %s on every revision", (name, why) => {
    expect(configured.has(name), `${name} is not set on the Cloud Run revision — ${why}`).toBe(
      true,
    );
  });

  it("enables address search on the deployed revision", () => {
    // The defect this file was written for. `VENUE_SEARCH_PROVIDER` is not a
    // credential — the one implemented provider needs no account and no key —
    // so it belongs in `env_vars` rather than Secret Manager.
    expect(
      configured.has(PROVIDER_VARIABLE),
      `${PROVIDER_VARIABLE} is not set on the Cloud Run revision, so the deployed ` +
        "venue field will tell operators that address search is not set up",
    ).toBe(true);
    expect(deployCode).toMatch(new RegExp(`${PROVIDER_VARIABLE}=photon`));
  });

  it("leaves the geocoder endpoint unset, so the documented default applies", () => {
    // Blank means the free public instance. Pinning it here would make a
    // self-hosted move a code change, which is what the configuration module
    // exists to avoid.
    expect(configured.has(BASE_URL_VARIABLE)).toBe(false);
  });

  /**
   * Every credential the outbound, callback and email paths refuse to run
   * without, and the scheduler's own shared secret. LAN-168 item 0 wired all
   * of these into `secrets:` — none may sit in plain `--set-env-vars` text,
   * which lands in the workflow file and the revision's own description.
   */
  const REQUIRED_SECRETS: readonly (readonly [name: string, why: string])[] = [
    ["WHATSAPP_ACCESS_TOKEN", "the sender has no credential to call the Graph API with"],
    [
      "WHATSAPP_APP_SECRET",
      "inbound callbacks cannot be verified and the webhook route answers 503 (LAN-78)",
    ],
    [
      "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
      "Meta's subscription handshake cannot be answered and the webhook route answers 403",
    ],
    ["EMAIL_API_KEY", "the email fallback has no provider credential and refuses (LAN-169)"],
    [
      SCHEDULER_TOKEN_VARIABLE,
      "the scheduler route has no trigger token and refuses every sweep with 503",
    ],
  ];

  it.each(REQUIRED_SECRETS)("injects %s from Secret Manager", (name, why) => {
    expect(
      secrets.has(name),
      `${name} is not read from Secret Manager in deploy.yml's secrets: block — ${why}`,
    ).toBe(true);
    expect(
      configured.has(name),
      `${name} is a credential and must not be a plain --set-env-vars entry`,
    ).toBe(false);
  });

  it("wires every outbound, callback, email and scheduler variable into the deploy", () => {
    // LAN-168 item 0. Shipping the code that reads a variable is not the same
    // as the deploy setting it — the whole reason this file exists — so every
    // variable each of these four lists names must land somewhere in
    // deploy.yml, as either a plain env var or a Secret Manager binding, and
    // be named in docs/deployment.md so a reader can tell which and why.
    const everyDeliveryVariable = [
      ...OUTBOUND_ENVIRONMENT_VARIABLES,
      ...WEBHOOK_ENVIRONMENT_VARIABLES,
      ...EMAIL_ENVIRONMENT_VARIABLES,
      SCHEDULER_TOKEN_VARIABLE,
    ];
    for (const variable of everyDeliveryVariable) {
      expect(
        configured.has(variable) || secrets.has(variable),
        `${variable} is neither a Cloud Run env var nor a Secret Manager binding in deploy.yml`,
      ).toBe(true);
      expect(deploymentDoc, `${variable} is not named in docs/deployment.md`).toContain(variable);
    }
  });

  it("creates the messaging scheduler job and masks its trigger token before use", () => {
    // LAN-168 item 0. Nothing advances the WhatsApp/email chase ladder on a
    // deployed revision unless something sweeps it — see
    // src/app/api/scheduler/messaging/route.ts. The step must exist, target
    // the sweep endpoint on a five-minute cadence, and never let the token it
    // reads from Secret Manager reach a log line unmasked — including a
    // failed gcloud call's own error text, which `::add-mask::` still catches
    // once emitted, because it matches the literal value anywhere afterwards.
    const stepStart = deployCode.indexOf("Ensure the messaging scheduler job");
    expect(stepStart, "deploy.yml has no 'Ensure the messaging scheduler job' step").not.toBe(-1);
    const nextStepStart = deployCode.indexOf("\n      - name:", stepStart + 1);
    const step = deployCode.slice(stepStart, nextStepStart === -1 ? undefined : nextStepStart);

    expect(step).toMatch(/lancers-messaging-sweep/);
    expect(step).toMatch(/\*\/5 \* \* \* \*/);
    expect(step).toMatch(/\/api\/scheduler\/messaging/);
    expect(step).toMatch(/gcloud scheduler jobs describe/);
    expect(step).toMatch(/gcloud scheduler jobs "?\$\{ACTION\}"? http/);
    expect(step).toMatch(/--attempt-deadline=60s/);
    expect(step).toMatch(/--time-zone=Europe\/London/);

    const maskIndex = step.indexOf("::add-mask::");
    const headersIndex = step.indexOf("--headers=");
    expect(maskIndex, "the scheduler trigger token is never masked with ::add-mask::").not.toBe(-1);
    expect(headersIndex, "the scheduler step never passes the token via --headers").not.toBe(-1);
    expect(
      maskIndex,
      "the token must be masked before it reaches --headers, which can appear in gcloud's own error output",
    ).toBeLessThan(headersIndex);

    // Never a bare echo of the token variable.
    expect(step).not.toMatch(/echo\s+"?\$\{?TOKEN\}?"?\s*$/m);

    // Does not fail the deploy on a permission problem — it warns and exits clean.
    expect(step).toMatch(/::warning title=Messaging scheduler not configured::/);
    expect(step).toMatch(/roles\/cloudscheduler\.admin/);
    expect(step).toMatch(/roles\/secretmanager\.secretAccessor/);
    expect(step).toMatch(/cloudscheduler\.googleapis\.com/);
  });

  it("documents every variable the deploy sets", () => {
    // A variable set on a revision and explained nowhere is the same failure in
    // the other direction: nobody can tell whether it is load-bearing.
    for (const variable of configured) {
      expect(
        deploymentDoc,
        `${variable} is set by the deploy but not in docs/deployment.md`,
      ).toContain(variable);
      expect(envExample, `${variable} is set by the deploy but not in .env.example`).toContain(
        variable,
      );
    }
  });

  it("documents every secret the deploy injects", () => {
    // Same failure, the other direction, for Secret Manager bindings.
    for (const variable of secrets) {
      expect(
        deploymentDoc,
        `${variable} is injected by the deploy but not in docs/deployment.md`,
      ).toContain(variable);
      expect(envExample, `${variable} is injected by the deploy but not in .env.example`).toContain(
        variable,
      );
    }
  });

  it("keeps credentials out of env_vars", () => {
    // `env_vars` lands in the workflow file and in the revision's description.
    // Anything secret belongs in `secrets:`, read from Secret Manager, which is
    // asserted by its own line below rather than assumed.
    for (const variable of configured) {
      expect(variable, `${variable} looks like a credential`).not.toMatch(
        /(TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL)$/,
      );
    }
    expect(deployCode).toMatch(/secrets:\s*\|\s*\n\s*SUPABASE_SECRET_KEY=/);
  });
});
