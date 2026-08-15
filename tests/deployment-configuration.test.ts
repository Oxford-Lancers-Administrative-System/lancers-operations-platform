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

import { OUTBOUND_ENVIRONMENT_VARIABLES } from "@/lib/delivery/config";
import { BASE_URL_VARIABLE, PROVIDER_VARIABLE } from "@/lib/venue-search/config";

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

/** The `env_vars:` block the Cloud Run deploy step passes, as a set of names. */
function configuredVariables(): Set<string> {
  const block = /\n\s*env_vars:\s*\|-?\n([\s\S]*?)\n\s{10}[a-z_]+:/.exec(deployCode)?.[1] ?? "";
  const names = new Set<string>();
  for (const line of block.split("\n")) {
    const name = /^\s*([A-Z0-9_]+)=/.exec(line)?.[1];
    if (name) names.add(name);
  }
  return names;
}

describe("the deploy turns on what the code refuses to run without", () => {
  const configured = configuredVariables();

  it("parses the workflow's env_vars block at all", () => {
    // A parser that silently found nothing would pass every test below by
    // reporting that nothing is configured and nothing needs to be.
    expect(configured.size).toBeGreaterThan(0);
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

  it("records the WhatsApp variables as knowingly absent, with their owner", () => {
    // These cannot be fixed by editing the workflow: they need the club's Meta
    // business portfolio and an approved template, which is LAN-101's. What
    // must never happen is their absence going unrecorded, because the visible
    // symptom — approval delivering nothing — looks like a code fault.
    for (const variable of OUTBOUND_ENVIRONMENT_VARIABLES) {
      // `APP_BASE_URL` is skipped, and the reason is worth writing down: it is
      // the only one of the four that is not a Meta credential, so it *could*
      // be set today. It is not, because setting it alone would enable nothing
      // — delivery needs all four — and a half-configured provider is a worse
      // signal than an unconfigured one. It goes in with LAN-101, not before.
      if (variable === "APP_BASE_URL") continue;
      expect(
        configured.has(variable),
        `${variable} is set by the deploy, so it is no longer "knowingly absent"`,
      ).toBe(false);
    }
    expect(deploymentDoc).toMatch(/knowingly absent/i);
    expect(deploymentDoc).toMatch(/LAN-101/);
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
