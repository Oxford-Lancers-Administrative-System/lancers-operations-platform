// @vitest-environment node
/**
 * The founding-operator bootstrap, proved against **local** Supabase — LAN-135,
 * `REQ-one-time-bootstrap` and `REQ-no-production-boundary-expansion`.
 *
 * `scripts/production/bootstrap-founding-operators.mjs` is the procedure that
 * gives the club its first three administrators. It runs by hand, once, against
 * the one hosted database, and after it has run "any later manual SQL
 * provisioning touch is a defect". A script with that job has to be proved
 * before it is trusted, and it has to be proved somewhere it cannot do harm —
 * so everything below runs against the disposable local stack, and the script's
 * own entry point refuses to run inside a test runner at all.
 *
 * Six things are asserted, in this order:
 *
 *  1. **It cannot be reached by accident**, and it cannot be pointed at a
 *     database and an Auth server that are not the same project.
 *  2. **The manifest is refused unless it is complete and unambiguous** — no
 *     defaults, no guessing, no partial acceptance.
 *  3. **The audit evidence it writes matches the application's own vocabulary
 *     exactly.** This is the load-bearing one. The script is a `.mjs` file and
 *     cannot import `src/lib/services/administration-events.ts`, so it restates
 *     the envelope; the test builds the same record both ways and fails if any
 *     field differs. Without this, "founding operators have visible history"
 *     would be a claim in a comment.
 *  4. **The dry run writes nothing** — measured, not assumed, by comparing a
 *     fingerprint of every table the script can write to.
 *  5. **It is idempotent, and its evidence is readable.** A first run
 *     establishes three operators; the rows it wrote come back through
 *     `readOperatorAuditHistory` and `readHolderHistory` — the application's
 *     own projections, unmodified — and a second run changes nothing at all.
 *  6. **It fails closed**, on every conflict it can meet, and a refused run
 *     leaves the database exactly as it found it.
 *
 * ## What is real here and what is posed
 *
 * The Supabase **administrative API is the real one**, against the local Auth
 * server: `REQ-one-time-bootstrap` requires provisioning through it "rather
 * than direct SQL insertion into Auth-owned tables", and a fake would prove
 * nothing about that. Logins are genuinely created and genuinely removed again.
 *
 * Only `sendInvitation` is posed. Two reasons: the local Auth server rate-limits
 * outbound mail and a suite that sends six emails per run becomes a suite that
 * fails for a reason unrelated to what it tests; and a delivery *failure* has to
 * be poseable, because the state it produces is one the club's record must show.
 */
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import pg, { type Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { capabilityRoleCodes } from "@/lib/auth/capabilities";
import { INVITATION_CALLBACK_PATH as APP_INVITATION_CALLBACK_PATH } from "@/lib/auth/invitation";
import { looksLikeEmailAddress as appLooksLikeEmailAddress } from "@/lib/auth/recovery";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { closePool } from "@/lib/db";
import {
  ADMINISTRATION_HISTORY_CAPABILITY,
  readHolderHistory,
  readOperatorAuditHistory,
} from "@/lib/services/administration-audit";
import {
  ADMINISTRATION_ACTIONS,
  ADMINISTRATION_CONTEXT_KEY as APP_CONTEXT_KEY,
  ADMINISTRATION_ENVELOPE_VERSION as APP_ENVELOPE_VERSION,
  prepareAdministrationEvent,
} from "@/lib/services/administration-events";

import { resolveLocalDatabaseUrl } from "../scripts/lib/local-db.mjs";
import {
  ADMINISTRATION_CONTEXT_KEY,
  ADMINISTRATION_ENVELOPE_VERSION,
  BOOTSTRAP_ACTOR_LABEL,
  bootstrapAuthority,
  invitationDeliveryFailedRow,
  invitationResentRow,
  operatorInvitedRow,
  roleAssignedRow,
} from "../scripts/production/bootstrap/audit.mjs";
import { FINGERPRINTED_TABLES, fingerprint } from "../scripts/production/bootstrap/database.mjs";
import {
  assertIdentityTarget,
  supabaseIdentity,
} from "../scripts/production/bootstrap/identity.mjs";
import {
  looksLikeEmailAddress,
  parseManifest,
  REQUIRED_ROLE_CODES,
} from "../scripts/production/bootstrap/manifest.mjs";
import { APPLY, DRY_RUN } from "../scripts/production/bootstrap/plan.mjs";
import {
  assertOwnerShell,
  INVITATION_CALLBACK_PATH,
  parseArguments,
  runBootstrap,
} from "../scripts/production/bootstrap-founding-operators.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

/**
 * The shape of a run's report, named here because the script is JavaScript and
 * TypeScript infers its parameter types from the defaults — which makes
 * `callbackUrl: null` a type rather than a default. Naming it also documents
 * exactly which fields this suite depends on.
 */
interface BootstrapReport {
  mode: string;
  runId: string;
  wroteNothing: boolean;
  plan: {
    clean: boolean;
    settled: boolean;
    writes: number;
    conflicts: { rule: string; message: string }[];
    entries: { entry: { roleCode: string }; person: { action: string } }[];
  };
  applied: {
    personId: string;
    operatorAccountId: string;
    planned: { entry: { roleCode: string } };
  }[];
  invitations: { roleCode: string; ok: boolean; reason: string | null }[];
}

interface BootstrapArgs {
  client: Client;
  identity: unknown;
  manifest: unknown;
  mode?: string;
  resend?: boolean;
  callbackUrl?: string | null;
}

const bootstrap = (args: BootstrapArgs): Promise<BootstrapReport> =>
  (runBootstrap as unknown as (a: BootstrapArgs) => Promise<BootstrapReport>)(args);

// ---------------------------------------------------------------------------
// Synthetic identities. Obviously synthetic, on a reserved domain (RFC 2606),
// because the real ones are Brian's to supply at run time and must never be in
// this repository — see `bootstrap/manifest.mjs`.
// ---------------------------------------------------------------------------

const MARKER = "LAN135Fixture";
const PRESIDENT_EMAIL = "lan135-president@example.invalid";
const GM_EMAIL = "lan135-general-manager@example.invalid";
const IT_EMAIL = "lan135-it-officer@example.invalid";

const MANIFEST = {
  operators: [
    {
      roleCode: "president",
      givenName: MARKER,
      familyName: "Presidentcandidate",
      email: PRESIDENT_EMAIL,
    },
    {
      roleCode: "general_manager",
      givenName: MARKER,
      familyName: "Generalmanagercandidate",
      email: GM_EMAIL,
    },
    {
      roleCode: "it_officer",
      givenName: MARKER,
      familyName: "Itofficercandidate",
      email: IT_EMAIL,
    },
  ],
};

const ALL_EMAILS = [PRESIDENT_EMAIL, GM_EMAIL, IT_EMAIL];
const CALLBACK_URL = "https://example.invalid/auth/invitation";

// ---------------------------------------------------------------------------
// 1 — it cannot be reached by accident
// ---------------------------------------------------------------------------

describe("the bootstrap refuses to run anywhere it should not", () => {
  it.each([
    ["CI", { CI: "true" }],
    ["a Vitest run", { VITEST: "true" }],
    ["NODE_ENV=test", { NODE_ENV: "test" }],
  ])("refuses inside %s", (_label, env) => {
    expect(() => assertOwnerShell(env as NodeJS.ProcessEnv)).toThrow(
      /owner-run production procedure/i,
    );
  });

  it("permits an owner's own shell", () => {
    expect(() =>
      assertOwnerShell({ CI: "false", VITEST: undefined, NODE_ENV: "production" }),
    ).not.toThrow();
  });

  it("is a dry run unless --apply is given", () => {
    const options = parseArguments(["--manifest", "/tmp/m.json"]);
    expect(options.mode).toBe(DRY_RUN);
    expect(parseArguments(["--manifest", "/tmp/m.json", "--apply"]).mode).toBe(APPLY);
  });

  it("refuses without a manifest, and refuses a flag as the manifest path", () => {
    expect(() => parseArguments(["--apply"])).toThrow(/manifest/i);
    expect(() => parseArguments(["--manifest", "--apply"])).toThrow(/manifest/i);
  });

  it("refuses an invitation link that is not https, except on this machine", () => {
    expect(() =>
      parseArguments(["--manifest", "/tmp/m.json", "--app-base-url", "http://club.example.com"]),
    ).toThrow(/https/i);

    expect(
      parseArguments(["--manifest", "/tmp/m.json", "--app-base-url", "http://localhost:3000"])
        .callbackUrl,
    ).toBe(`http://localhost:3000${INVITATION_CALLBACK_PATH}`);
  });

  it("builds the invitation link on the route the application actually serves", () => {
    // Two copies exist because a `.mjs` operator script cannot import a module
    // that ships in the container. This is the payment for that.
    expect(INVITATION_CALLBACK_PATH).toBe(APP_INVITATION_CALLBACK_PATH);
  });

  it("refuses a hosted database paired with an Auth server that is not the same project", () => {
    expect(() =>
      assertIdentityTarget(
        { kind: "hosted" },
        { SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SECRET_KEY: "k" },
      ),
    ).toThrow(/same project/i);
  });

  it("refuses a local database paired with a hosted Auth server", () => {
    expect(() =>
      assertIdentityTarget(
        { kind: "local" },
        { SUPABASE_URL: "https://fggbgeraiadetyiyjlvb.supabase.co", SUPABASE_SECRET_KEY: "k" },
      ),
    ).toThrow(/same project/i);
  });

  it("refuses a lookalike host that merely contains the project reference", () => {
    expect(() =>
      assertIdentityTarget(
        { kind: "hosted" },
        {
          SUPABASE_URL: "https://fggbgeraiadetyiyjlvb.supabase.co.attacker.example",
          SUPABASE_SECRET_KEY: "k",
        },
      ),
    ).toThrow(/same project/i);
  });

  it("refuses with no key, and never echoes one", () => {
    expect(() =>
      assertIdentityTarget(
        { kind: "hosted" },
        { SUPABASE_URL: "https://fggbgeraiadetyiyjlvb.supabase.co" },
      ),
    ).toThrow(/privileged Supabase key/i);

    const secret = "sb_secret_do_not_print_me";
    try {
      assertIdentityTarget(
        { kind: "hosted" },
        { SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SECRET_KEY: secret },
      );
      expect.unreachable("must have refused");
    } catch (error) {
      expect((error as Error).message).not.toContain(secret);
    }
  });

  it("never falls back to .env.local for a hosted run", () => {
    // The load-bearing half, and it holds everywhere: a local key must never be
    // able to stand in for a production one.
    expect(() => assertIdentityTarget({ kind: "hosted" }, {})).toThrow(/Auth server/i);
  });

  it("finds the local Auth server with no configuration at all", () => {
    // A local rehearsal has to work from a plain command line, exactly as
    // `resolveTarget` already makes the database work. On a developer machine
    // that means reading `.env.local`; CI exports the same variables directly
    // and writes no such file, so the fallback is only exercised where the file
    // exists. The manual rehearsal in the pull request exercises it for real.
    if (!existsSync(path.join(repoRoot, ".env.local"))) return;

    const found = assertIdentityTarget({ kind: "local" }, {});
    expect(found.url).toMatch(/^https?:\/\/(127\.0\.0\.1|localhost)/);
    expect(found.key).toBeTruthy();
  });

  it("carries no name and no email address of a real person", () => {
    // `REQ-no-production-boundary-expansion`, and the repository's standing
    // rule that no real member data is committed. The identities arrive at run
    // time in a file outside the repository; nothing here may pre-empt them.
    //
    // **Read the directory, never a list.** This enumerated its six files until
    // LAN-135 review finding R3, and a seventh module added under `bootstrap/`
    // — with an address in it — passed both contract suites. A guard against
    // committing personal data to a public repository that inspects only the
    // files somebody remembered to name is not a guard.
    const files = bootstrapPackageFiles();

    // A vacuous pass is the failure this replaces: a broken walk that found
    // nothing would assert nothing, silently and forever.
    expect(files.length, "the package walk found no files").toBeGreaterThanOrEqual(6);

    for (const file of files) {
      const contents = readFileSync(file, "utf8");
      expect(
        contents,
        `${path.relative(repoRoot, file)} must contain no email address`,
      ).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    }
  });

  it("finds a newly added module, which is the whole point of reading the directory", () => {
    // The regression test for R3 itself: the walk must pick up a file nobody
    // has named anywhere, because that is exactly how the gap was reachable.
    const planted = path.join(repoRoot, "scripts/production/bootstrap/r3-probe.mjs");
    writeFileSync(planted, "// probe\n");
    try {
      expect(bootstrapPackageFiles()).toContain(planted);
    } finally {
      rmSync(planted, { force: true });
    }
  });
});

/**
 * Every file of the bootstrap package, found by walking rather than by list.
 *
 * The rule is "everything under `scripts/production/` whose name begins with
 * `bootstrap`" — the entry script, and the directory beside it — and it needs
 * no maintenance when a module is added.
 */
function bootstrapPackageFiles(): string[] {
  const root = path.join(repoRoot, "scripts/production");
  const found: string[] = [];

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.name.startsWith("bootstrap")) continue;
    const full = path.join(root, entry.name);

    if (entry.isDirectory()) {
      for (const nested of readdirSync(full, { withFileTypes: true, recursive: true })) {
        if (nested.isFile()) found.push(path.join(nested.parentPath ?? full, nested.name));
      }
    } else if (entry.isFile()) {
      found.push(full);
    }
  }

  return found;
}

// ---------------------------------------------------------------------------
// 2 — the manifest
// ---------------------------------------------------------------------------

describe("the manifest is refused unless it is complete and unambiguous", () => {
  const entry = (over: Record<string, unknown> = {}) => ({
    roleCode: "president",
    givenName: "Given",
    familyName: "Family",
    email: "a@example.invalid",
    ...over,
  });

  const complete = () => ({
    operators: [
      entry(),
      entry({ roleCode: "general_manager", email: "b@example.invalid" }),
      entry({ roleCode: "it_officer", email: "c@example.invalid" }),
    ],
  });

  it("accepts a complete manifest and normalises the address", () => {
    const parsed = parseManifest({
      operators: [
        entry({ email: "  A@Example.Invalid  " }),
        entry({ roleCode: "general_manager", email: "b@example.invalid" }),
        entry({ roleCode: "it_officer", email: "c@example.invalid" }),
      ],
    });
    expect(parsed.operators[0].email).toBe("a@example.invalid");
    expect(parsed.operators.map((o: { roleCode: string }) => o.roleCode)).toEqual([
      ...REQUIRED_ROLE_CODES,
    ]);
  });

  it("refuses a manifest missing any of the three founding seats", () => {
    for (const missing of REQUIRED_ROLE_CODES) {
      const partial = {
        operators: complete().operators.filter((o) => o.roleCode !== missing),
      };
      expect(() => parseManifest(partial), `${missing} must be required`).toThrow(
        new RegExp(missing),
      );
    }
  });

  it.each([
    ["not an object", "nope"],
    ["no operators", {}],
    ["an empty operator list", { operators: [] }],
  ])("refuses %s", (_label, raw) => {
    expect(() => parseManifest(raw)).toThrow();
  });

  it.each([
    ["a padded role code", { roleCode: " president " }],
    ["a blank given name", { givenName: "  " }],
    ["a missing family name", { familyName: undefined }],
    ["an address that is not one", { email: "not-an-address" }],
    ['a personId that is neither a UUID nor "new"', { personId: "maybe" }],
  ])("refuses %s", (_label, over) => {
    const raw = complete();
    raw.operators[0] = entry(over) as never;
    expect(() => parseManifest(raw)).toThrow();
  });

  it("refuses the same seat, the same address or the same Person twice", () => {
    const duplicateRole = complete();
    duplicateRole.operators[1].roleCode = "president";
    expect(() => parseManifest(duplicateRole)).toThrow(/more than once/i);

    const duplicateEmail = complete();
    duplicateEmail.operators[1].email = duplicateEmail.operators[0].email;
    expect(() => parseManifest(duplicateEmail)).toThrow(/more than one operator/i);

    const person = "11111111-1111-4111-8111-111111111111";
    const duplicatePerson = complete();
    (duplicatePerson.operators[0] as Record<string, unknown>).personId = person;
    (duplicatePerson.operators[1] as Record<string, unknown>).personId = person;
    expect(() => parseManifest(duplicatePerson)).toThrow(/same Person/i);
  });

  it("never quotes an address whole in a refusal", () => {
    const raw = complete();
    raw.operators[0] = entry({ email: "personal.address@real-domain.invalid" }) as never;
    raw.operators[1].email = "personal.address@real-domain.invalid";
    try {
      parseManifest(raw);
      expect.unreachable("must have refused");
    } catch (error) {
      expect((error as Error).message).not.toContain("personal.address@real-domain.invalid");
    }
  });

  it("judges an address exactly as the application does", () => {
    // The script restates `looksLikeEmailAddress` because it cannot import it.
    // This is the payment, in the arrangement `src/lib/db/url.ts` documents for
    // the two local-only guards.
    const table = [
      "a@b.co",
      "operator@club.example.com",
      "",
      "no-at-sign",
      "two@at@signs.com",
      "trailing@dot.",
      "@leading.com",
      "spaces in@address.com",
      "short@a.b",
      `${"x".repeat(320)}@example.com`,
    ];
    for (const value of table) {
      expect(looksLikeEmailAddress(value), value).toBe(appLooksLikeEmailAddress(value));
    }
  });
});

// ---------------------------------------------------------------------------
// 3 — the audit evidence matches the application's vocabulary exactly
// ---------------------------------------------------------------------------

describe("the audit rows it builds are the vocabulary's own", () => {
  const PERSON = "11111111-0000-4000-8000-000000000001";
  const ACTOR = "11111111-0000-4000-8000-0000000000ff";
  const ACCOUNT = "22222222-0000-4000-8000-000000000001";
  const ROLE = "33333333-0000-4000-8000-000000000001";
  const ASSIGNMENT = "44444444-0000-4000-8000-000000000001";
  const CORRELATION = "55555555-0000-4000-8000-000000000001";
  const YEAR = {
    scope: "committee_year",
    id: "66666666-0000-4000-8000-000000000001",
    label: "2026-27",
  } as const;
  const DETAIL = { bootstrap: true, runId: CORRELATION };

  /** What `prepareAdministrationEvent` would produce for the same event. */
  const prepared = (over: Record<string, unknown>) =>
    prepareAdministrationEvent({
      actorPersonId: ACTOR,
      authority: { kind: "capability", capability: "role_management", roleCodes: ["it_officer"] },
      target: { personId: PERSON, operatorAccountId: ACCOUNT },
      operatingYear: YEAR,
      correlationId: CORRELATION,
      detail: DETAIL,
      ...over,
    } as never);

  it("pins the envelope version and the context key", () => {
    expect(ADMINISTRATION_ENVELOPE_VERSION).toBe(APP_ENVELOPE_VERSION);
    expect(ADMINISTRATION_CONTEXT_KEY).toBe(APP_CONTEXT_KEY);
  });

  it("writes only actions the vocabulary defines", () => {
    const actions = [
      operatorInvitedRow,
      roleAssignedRow,
      invitationResentRow,
      invitationDeliveryFailedRow,
    ].map(
      (build) =>
        build({
          personId: PERSON,
          operatorAccountId: ACCOUNT,
          role: { id: ROLE, code: "president", assignmentId: ASSIGNMENT },
          operatingYear: YEAR,
          correlationId: CORRELATION,
          reason: "posed",
          detail: DETAIL,
        }).action,
    );

    for (const action of actions) {
      expect(ADMINISTRATION_ACTIONS as readonly string[]).toContain(action);
    }
  });

  it("names a mechanism as the actor and no person at all", () => {
    // `src/lib/services/audit.ts`: where the actor genuinely is not a person,
    // `actorLabel` names the mechanism honestly instead. Inventing a person
    // here would be a fabricated authority in a ledger that cannot be rewritten.
    const row = operatorInvitedRow({
      personId: PERSON,
      operatorAccountId: ACCOUNT,
      operatingYear: YEAR,
      correlationId: CORRELATION,
      detail: DETAIL,
    });
    expect(row.actorPersonId).toBeNull();
    expect(row.actorLabel).toBe(BOOTSTRAP_ACTOR_LABEL);
  });

  it("records that no capability and no club role was held", () => {
    // The literal truth of a bootstrap, and a triple the reader already
    // handles: `AdministrationEnvelope.authority.capability` is `string | null`.
    expect(bootstrapAuthority()).toEqual({ kind: "capability", capability: null, roleCodes: [] });
  });

  it("builds the operator-invited envelope exactly as the vocabulary does", () => {
    const mine = operatorInvitedRow({
      personId: PERSON,
      operatorAccountId: ACCOUNT,
      operatingYear: YEAR,
      correlationId: CORRELATION,
      detail: DETAIL,
    });
    const theirs = prepared({
      action: "administration.operator.invited",
      toState: "invitation_pending",
    });

    expect(mine.action).toBe(theirs.action);
    expect(mine.entityTable).toBe(theirs.entityTable);
    expect(mine.entityId).toBe(theirs.entityId);
    expect(mine.fromState).toBe(theirs.fromState);
    expect(mine.toState).toBe(theirs.toState);
    // Every field but the authority, which is the one thing a bootstrap
    // genuinely cannot state the same way — see `bootstrap/audit.mjs`.
    expect(withoutAuthority(mine.context[ADMINISTRATION_CONTEXT_KEY])).toEqual(
      withoutAuthority(theirs.envelope as unknown as Record<string, unknown>),
    );
  });

  it("builds the role-assigned envelope exactly as the vocabulary does", () => {
    const role = { id: ROLE, code: "president", assignmentId: ASSIGNMENT };
    const mine = roleAssignedRow({
      personId: PERSON,
      operatorAccountId: ACCOUNT,
      role,
      operatingYear: YEAR,
      correlationId: CORRELATION,
      detail: DETAIL,
    });
    const theirs = prepared({
      action: "administration.role.assigned",
      role,
      toState: "effective",
    });

    expect(mine.entityTable).toBe(theirs.entityTable);
    expect(mine.entityId).toBe(theirs.entityId);
    expect(mine.toState).toBe(theirs.toState);
    expect(withoutAuthority(mine.context[ADMINISTRATION_CONTEXT_KEY])).toEqual(
      withoutAuthority(theirs.envelope as unknown as Record<string, unknown>),
    );
  });

  it("builds the invitation-resent envelope exactly as the vocabulary does", () => {
    // The fourth of four, and it was the one without a field-level guard until
    // LAN-135 review finding R4. Injecting a wrong `entityTable` — and a
    // from/to pair that `prepareAdministrationEvent` refuses outright — left
    // every other pure test in this file passing.
    //
    // It matters beyond symmetry: `--resend` is the recovery the runbook tells
    // Brian to use after a delivery failure, so this is the row written on the
    // one path he reaches when something has already gone wrong.
    const mine = invitationResentRow({
      personId: PERSON,
      operatorAccountId: ACCOUNT,
      operatingYear: YEAR,
      correlationId: CORRELATION,
      detail: DETAIL,
    });
    const theirs = prepared({ action: "administration.operator.invitation_resent" });

    expect(mine.action).toBe(theirs.action);
    expect(mine.entityTable).toBe(theirs.entityTable);
    expect(mine.entityId).toBe(theirs.entityId);
    // `attempt` shape: a resend is a thing that was tried against an account
    // whose state it did not move, so there is no before and no after to record.
    expect(mine.fromState).toBe(theirs.fromState);
    expect(mine.toState).toBe(theirs.toState);
    expect(mine.reason).toBe(theirs.reason);
    expect(withoutAuthority(mine.context[ADMINISTRATION_CONTEXT_KEY])).toEqual(
      withoutAuthority(theirs.envelope as unknown as Record<string, unknown>),
    );
  });

  it("builds the delivery-failure envelope exactly as the vocabulary does", () => {
    const mine = invitationDeliveryFailedRow({
      personId: PERSON,
      operatorAccountId: ACCOUNT,
      operatingYear: YEAR,
      correlationId: CORRELATION,
      reason: "the mail server refused it",
      detail: DETAIL,
    });
    const theirs = prepared({
      action: "administration.operator.invitation_delivery_failed",
      fromState: "invitation_pending",
      toState: "delivery_failed",
      detail: { ...DETAIL, reason: "the mail server refused it" },
    });

    expect(mine.fromState).toBe(theirs.fromState);
    expect(mine.toState).toBe(theirs.toState);
    expect(withoutAuthority(mine.context[ADMINISTRATION_CONTEXT_KEY])).toEqual(
      withoutAuthority(theirs.envelope as unknown as Record<string, unknown>),
    );
  });
});

/** Just the row counts out of a fingerprint, so "same count, different content" is provable. */
function rowCounts(digest: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(digest).map(([table, value]) => [table, value.split(":")[0]]),
  );
}

/**
 * One envelope, minus the single field a bootstrap genuinely cannot state the
 * same way as a human administrator can — see `bootstrap/audit.mjs`. Everything
 * else must match the vocabulary exactly, and does.
 */
function withoutAuthority(envelope: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...envelope };
  delete rest.authority;
  return rest;
}

// ---------------------------------------------------------------------------
// 4, 5, 6 — against the local stack
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(supabaseUrl && supabaseKey);

if (process.env.REQUIRE_SUPABASE_TESTS === "1" && !configured) {
  throw new Error("REQUIRE_SUPABASE_TESTS=1 but the local Supabase Auth configuration is missing.");
}

describe.runIf(configured)("the bootstrap, run against local Supabase", () => {
  let client: Client;
  /** The real administrative API, with only the send posed. */
  let identity: ReturnType<typeof supabaseIdentity> & { sent: string[]; failSend: boolean };
  /** Seats the synthetic seed already fills, vacated for this suite and restored. */
  let vacated: { id: string; effectiveTo: string | null }[] = [];

  const administrator = (personId: string): ResolvedOperator => ({
    authUserId: "00000000-0000-4000-8000-00000000013f",
    personId,
    displayName: "Administrator",
    roleCodes: [...capabilityRoleCodes(ADMINISTRATION_HISTORY_CAPABILITY)],
    isActive: true,
  });

  async function fixturePersonIds(): Promise<string[]> {
    const { rows } = await client.query<{ id: string }>(
      "select id from public.people where given_name = $1",
      [MARKER],
    );
    return rows.map((row) => row.id);
  }

  /** Removes everything this suite could have created, in dependency order. */
  async function removeFixtures(): Promise<void> {
    const people = await fixturePersonIds();

    await client.query(
      `delete from public.audit_events
        where actor_label = $1
          and (context -> 'administration' ->> 'targetPersonId') = any($2::text[])`,
      [BOOTSTRAP_ACTOR_LABEL, people],
    );
    await client.query("delete from public.role_assignments where person_id = any($1::uuid[])", [
      people,
    ]);
    await client.query("delete from public.operator_accounts where person_id = any($1::uuid[])", [
      people,
    ]);
    await client.query("delete from public.contact_points where person_id = any($1::uuid[])", [
      people,
    ]);
    await client.query("delete from public.people where id = any($1::uuid[])", [people]);

    // The Auth logins, through the administrative API that created them.
    for (const email of ALL_EMAILS) {
      const found = await identity.findLoginByEmail(email);
      if (found) await identity.deleteLogin(found.id);
    }
  }

  /**
   * Ends the seeded holder of a single-holder seat, remembering where it was.
   *
   * The synthetic seed fills President and General Manager in the current
   * committee year, which is correct for a seeded club and is exactly the state
   * a real founding bootstrap will not be in. Ending them for the duration of
   * this suite is the smallest honest way to reach the state the script is for;
   * `restoreSeats` puts them back, after this suite's own assignments are gone.
   */
  async function vacateSeats(): Promise<void> {
    const { rows } = await client.query<{ id: string; effective_to: string | null }>(
      `select ra.id, ra.effective_to::text as effective_to
         from public.role_assignments ra
         join public.roles r on r.id = ra.role_id
        where r.code = any($1::text[])
          and (ra.effective_to is null or ra.effective_to > current_date)
          and ra.effective_from < current_date`,
      [["president", "general_manager"]],
    );
    vacated = rows.map((row) => ({ id: row.id, effectiveTo: row.effective_to }));

    if (vacated.length > 0) {
      await client.query(
        "update public.role_assignments set effective_to = current_date where id = any($1::uuid[])",
        [vacated.map((row) => row.id)],
      );
    }
  }

  async function restoreSeats(): Promise<void> {
    for (const seat of vacated) {
      await client.query("update public.role_assignments set effective_to = $2 where id = $1", [
        seat.id,
        seat.effectiveTo,
      ]);
    }
    vacated = [];
  }

  beforeAll(async () => {
    client = new pg.Client({ connectionString: resolveLocalDatabaseUrl() });
    await client.connect();

    const real = supabaseIdentity({ url: supabaseUrl!, key: supabaseKey! });
    identity = Object.assign(Object.create(null), real, {
      sent: [] as string[],
      failSend: false,
      async sendInvitation(email: string) {
        if (identity.failSend) throw new Error("posed: the mail server refused it");
        identity.sent.push(email);
      },
    });

    await removeFixtures();
    await vacateSeats();
  }, 60_000);

  afterAll(async () => {
    // This suite's rows first, then the seats, or restoring an open-ended
    // seeded assignment would overlap one this suite created.
    await removeFixtures().catch(() => undefined);
    await restoreSeats().catch(() => undefined);
    await closePool().catch(() => undefined);
    await client?.end().catch(() => undefined);
  }, 60_000);

  const manifest = () => parseManifest(structuredClone(MANIFEST));

  it("fingerprints exactly the tables the writers touch, and no stale list", async () => {
    // The digest is only a safety check if it covers what the script writes.
    // Derived from the source rather than compared to a second list, so a table
    // added to a write path with no fingerprint entry fails here.
    const writers = readFileSync(
      path.join(repoRoot, "scripts/production/bootstrap/database.mjs"),
      "utf8",
    );
    const written = new Set(
      [...writers.matchAll(/\b(?:insert into|update)\s+(public\.[a-z_]+)/g)].map((m) => m[1]),
    );

    expect(written.size).toBeGreaterThan(0);
    expect([...written].sort()).toEqual([...FINGERPRINTED_TABLES].sort());
  });

  it("sees a write that changes no row count — LAN-135 finding R2", async () => {
    // The injection the reviewer used. `recordInvitationOutcome` really does
    // write `updated_at`, `invited_at` and the two delivery-failure columns
    // without inserting anything, so a row-count fingerprint could report
    // `wroteNothing: true` with rows genuinely changed.
    const before = await fingerprint(client);

    await client.query("begin");
    await client.query("update public.operator_accounts set updated_at = now()");
    const during = await fingerprint(client);
    await client.query("rollback");

    expect(during).not.toEqual(before);
    // Same row count, different content — which is exactly the case a count
    // could not see.
    expect(rowCounts(during)).toEqual(rowCounts(before));
    expect(await fingerprint(client)).toEqual(before);
  }, 60_000);

  it("creates no Auth login during a dry run, which is why the digest need not cover auth", async () => {
    // `fingerprint` deliberately does not read `auth.users`: the hosted run
    // authenticates as `app_runtime`, which has no reach into the `auth` schema
    // (ADR 0026). The claim that this is safe rests on `createLogin` being
    // reachable only from `applyOperator`, so that is measured here directly
    // rather than argued in a comment.
    const before = await client.query<{ count: string }>(
      "select count(*)::text as count from auth.users",
    );

    await bootstrap({ client, identity, manifest: manifest(), mode: DRY_RUN });

    const after = await client.query<{ count: string }>(
      "select count(*)::text as count from auth.users",
    );
    expect(after.rows[0].count).toBe(before.rows[0].count);
  }, 60_000);

  it("previews a complete plan and writes nothing at all", async () => {
    const before = await fingerprint(client);

    const report = await bootstrap({ client, identity, manifest: manifest(), mode: DRY_RUN });

    expect(report.mode).toBe(DRY_RUN);
    expect(report.plan.conflicts).toEqual([]);
    // Three people, three logins, three seats.
    expect(report.plan.writes).toBe(9);
    expect(report.plan.entries.map((e) => e.person.action)).toEqual(["create", "create", "create"]);

    // Measured, not assumed. The script checks this itself and refuses to
    // report success if it does not hold.
    expect(report.wroteNothing).toBe(true);
    expect(await fingerprint(client)).toEqual(before);
    expect(identity.sent).toEqual([]);
  }, 60_000);

  it("establishes the three founding operators, and their evidence is readable", async () => {
    identity.sent = [];
    const report = await bootstrap({
      client,
      identity,
      manifest: manifest(),
      mode: APPLY,
      callbackUrl: CALLBACK_URL,
    });

    expect(report.invitations.every((i) => i.ok)).toBe(true);
    expect(identity.sent.sort()).toEqual([...ALL_EMAILS].sort());

    const people = await fixturePersonIds();
    expect(people).toHaveLength(3);

    // The rows, as the club's own tables hold them.
    const accounts = await client.query<{ login_email: string; is_active: boolean }>(
      "select login_email, is_active from public.operator_accounts where person_id = any($1::uuid[])",
      [people],
    );
    expect(accounts.rows.map((row) => row.login_email).sort()).toEqual([...ALL_EMAILS].sort());
    expect(accounts.rows.every((row) => row.is_active)).toBe(true);

    const seats = await client.query<{ code: string; effective_to: string | null }>(
      `select r.code, ra.effective_to::text as effective_to
         from public.role_assignments ra join public.roles r on r.id = ra.role_id
        where ra.person_id = any($1::uuid[]) order by r.code`,
      [people],
    );
    expect(seats.rows.map((row) => row.code)).toEqual([
      "general_manager",
      "it_officer",
      "president",
    ]);
    // "Standing" and "active-year" are renewal policy, not a column: all three
    // are open-ended assignments against the one active committee year.
    expect(seats.rows.every((row) => row.effective_to === null)).toBe(true);

    // And now the load-bearing assertion: the application's own projections
    // read what the script wrote, unmodified.
    const president = report.applied.find((a) => a.planned.entry.roleCode === "president")!;
    const history = await readOperatorAuditHistory(
      administrator(people[0]),
      president.personId as string,
    );

    expect(history.map((entry) => entry.action)).toEqual([
      "administration.role.assigned",
      "administration.operator.invited",
    ]);
    expect(history[0].actor).toEqual({ personId: null, name: BOOTSTRAP_ACTOR_LABEL });
    expect(history[0].unreadable).toBeNull();
    expect(history[0].authority).toEqual({ kind: "capability", capability: null, roleCodes: [] });
    expect(history[0].target.personId).toBe(president.personId);
    expect(history[0].detail).toMatchObject({ bootstrap: true, runId: report.runId });

    const holders = await readHolderHistory(
      administrator(people[0]),
      history[0].role!.id as string,
    );
    expect(holders.map((entry) => entry.id)).toContain(history[0].id);

    // One event, two projections — not two rows. The assignment appears in both
    // because it names both a Person and a role.
    const written = await client.query<{ count: string }>(
      `select count(*)::text as count from public.audit_events
        where actor_label = $1 and (context -> 'administration' ->> 'targetPersonId') = $2`,
      [BOOTSTRAP_ACTOR_LABEL, president.personId],
    );
    expect(written.rows[0].count).toBe("2");
  }, 120_000);

  it("is idempotent — a second run finds everything and changes nothing", async () => {
    const before = await fingerprint(client);
    identity.sent = [];

    const preview = await bootstrap({ client, identity, manifest: manifest(), mode: DRY_RUN });
    expect(preview.plan.settled).toBe(true);
    expect(preview.plan.writes).toBe(0);

    const report = await bootstrap({
      client,
      identity,
      manifest: manifest(),
      mode: APPLY,
      callbackUrl: CALLBACK_URL,
    });

    expect(report.plan.conflicts).toEqual([]);
    expect(report.invitations).toEqual([]);
    // No second email, either: an email arriving twice is a change even though
    // no row moved.
    expect(identity.sent).toEqual([]);
    expect(await fingerprint(client)).toEqual(before);
  }, 120_000);

  it("refuses a Person it cannot tell apart from one already recorded", async () => {
    // The dangerous case is not a missing Person, it is the wrong one.
    const raw = structuredClone(MANIFEST);
    raw.operators[2] = {
      ...raw.operators[2],
      email: "lan135-ambiguous@example.invalid",
      familyName: "Presidentcandidate",
    };

    const before = await fingerprint(client);
    const report = await bootstrap({
      client,
      identity,
      manifest: parseManifest(raw),
      mode: DRY_RUN,
    });

    expect(report.plan.conflicts.map((c) => c.rule)).toContain("person_duplicate_candidates");
    expect(await fingerprint(client)).toEqual(before);
  }, 60_000);

  it("refuses to adopt an Auth login that no operator account points at", async () => {
    const orphan = "lan135-orphan@example.invalid";
    const created = await identity.createLogin(orphan);

    try {
      const raw = structuredClone(MANIFEST);
      raw.operators[2] = { ...raw.operators[2], email: orphan, familyName: "Orphancandidate" };

      const report = await bootstrap({
        client,
        identity,
        manifest: parseManifest(raw),
        mode: DRY_RUN,
      });

      expect(report.plan.conflicts.map((c) => c.rule)).toContain(
        "auth_login_without_operator_account",
      );
      expect(report.plan.clean).toBe(false);
    } finally {
      await identity.deleteLogin(created.authUserId);
    }
  }, 60_000);

  it("refuses a role the catalogue does not have", async () => {
    const raw = structuredClone(MANIFEST);
    // A fourth seat the catalogue does not have. The three required ones stay,
    // so this is refused for the role and not for an incomplete manifest.
    raw.operators.push({
      roleCode: "supreme_leader",
      givenName: MARKER,
      familyName: "Unknowncandidate",
      email: "lan135-unknown@example.invalid",
    });

    const report = await bootstrap({
      client,
      identity,
      manifest: parseManifest(raw),
      mode: DRY_RUN,
    });

    expect(report.plan.conflicts.map((c) => c.rule)).toContain("role_not_in_catalogue");
  }, 60_000);

  it("refuses the whole run when any one entry conflicts, and applies nothing", async () => {
    // Fail closed means refusing all three. A half-applied bootstrap is the
    // worst state this script can leave the club in.
    await removeFixtures();
    const before = await fingerprint(client);

    const raw = structuredClone(MANIFEST);
    // A fourth seat the catalogue does not have. The three required ones stay,
    // so this is refused for the role and not for an incomplete manifest.
    raw.operators.push({
      roleCode: "supreme_leader",
      givenName: MARKER,
      familyName: "Unknowncandidate",
      email: "lan135-unknown@example.invalid",
    });

    await expect(
      bootstrap({
        client,
        identity,
        manifest: parseManifest(raw),
        mode: APPLY,
        callbackUrl: CALLBACK_URL,
      }),
    ).rejects.toThrow(/Refusing to apply/i);

    expect(await fingerprint(client)).toEqual(before);
    expect(await fixturePersonIds()).toEqual([]);
  }, 120_000);

  it("records a delivery failure against an operator who exists", async () => {
    await removeFixtures();
    identity.failSend = true;

    try {
      const report = await bootstrap({
        client,
        identity,
        manifest: manifest(),
        mode: APPLY,
        callbackUrl: CALLBACK_URL,
      });

      expect(report.invitations.every((i) => !i.ok)).toBe(true);

      const people = await fixturePersonIds();
      // The operators exist. A delivery failure is a recorded outcome, never a
      // reason to undo the operator it was about.
      expect(people).toHaveLength(3);

      const failed = await client.query<{ count: string }>(
        `select count(*)::text as count from public.operator_accounts
          where person_id = any($1::uuid[]) and invitation_delivery_failed_at is not null`,
        [people],
      );
      expect(failed.rows[0].count).toBe("3");

      const events = await client.query<{ count: string }>(
        `select count(*)::text as count from public.audit_events
          where actor_label = $1
            and action = 'administration.operator.invitation_delivery_failed'
            and (context -> 'administration' ->> 'targetPersonId') = any($2::text[])`,
        [BOOTSTRAP_ACTOR_LABEL, people],
      );
      expect(events.rows[0].count).toBe("3");
    } finally {
      identity.failSend = false;
      await removeFixtures();
    }
  }, 120_000);
});
