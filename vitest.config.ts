import { configDefaults, defineConfig } from "vitest/config";
import { config as loadEnv } from "dotenv";
import path from "node:path";

// Load .env.local so tests that need the local Supabase stack (tests/rls-posture)
// find it, exactly as `next dev` would. CI provides the same variables directly.
loadEnv({ path: path.resolve(import.meta.dirname, ".env.local"), quiet: true });

/**
 * Every test file that talks to the one local PostgreSQL database.
 *
 * ## Why this list exists
 *
 * There is one local database and no per-test schema. Vitest runs test files in
 * parallel by default, so two files that reach that database are two concurrent
 * sessions against the same rows. Three separate failures came out of that, each
 * found by accident at the cost of a CI rerun (LAN-139):
 *
 * - `tests/pilot-scenario-lan-76.test.ts` wraps every test in
 *   `repeatable read` and rolls back. PostgreSQL is *specified* to abort such a
 *   transaction with SQLSTATE `40001` the moment a concurrent session commits to
 *   a row it read. That is not bad luck; it is the isolation level's contract.
 * - Suites that commit fixtures into shared catalogue tables are exactly such a
 *   concurrent session.
 * - Suites that assert a count they do not own see another suite's rows.
 *
 * Files named here run in the `database` project, which uses a single fork and
 * therefore runs them **one at a time**. Everything else runs in the `unit`
 * project, in parallel, and is *forbidden* from reaching the database:
 * `vitest.setup.ts` refuses the connection with a message naming this list.
 *
 * ## Adding to it
 *
 * A new test file that opens a PostgreSQL connection, or calls the local
 * Supabase Data API, belongs here. You will not have to remember: the guard in
 * `vitest.setup.ts` fails the file the first time it tries, and tells you what
 * to do. See docs/adr/0029-serialized-database-test-suites.md.
 *
 * Exported so `tests/database-suite-isolation.test.ts` can check it stays
 * accurate.
 */
export const DATABASE_TEST_SUITES: readonly string[] = [
  "src/app/api/webhooks/whatsapp/route.test.ts",
  "src/app/join/[code]/actions.test.ts",
  "src/app/me/join/[token]/actions.test.ts",
  "src/app/me/stop/[token]/actions.test.ts",
  "src/app/operate/admin/permissions.test.ts",
  "src/app/operate/people/[personId]/edit/actions.test.ts",
  "src/app/operate/people/[personId]/merge/actions.test.ts",
  "src/lib/services/administration-audit.test.ts",
  "src/lib/services/administration-directory.test.ts",
  "src/lib/services/attendance.test.ts",
  "src/lib/services/club-link-availability.test.ts",
  "src/lib/services/club-link.test.ts",
  "src/lib/services/delivery.test.ts",
  "src/lib/services/event-amendment.test.ts",
  "src/lib/services/event-approval.test.ts",
  "src/lib/services/event-import.test.ts",
  "src/lib/services/event-questions.test.ts",
  "src/lib/services/event-templates.test.ts",
  "src/lib/services/events.test.ts",
  "src/lib/services/follow-ups.test.ts",
  "src/lib/services/membership.test.ts",
  "src/lib/services/messaging-consent.test.ts",
  "src/lib/services/messaging-schedule.test.ts",
  "src/lib/services/messaging-scheduler.test.ts",
  "src/lib/services/operator-administration.test.ts",
  "src/lib/services/operator-invitations.test.ts",
  "src/lib/services/participation.test.ts",
  "src/lib/services/people-directory.test.ts",
  "src/lib/services/person-create.test.ts",
  "src/lib/services/person-duplicate.test.ts",
  "src/lib/services/person-merge.test.ts",
  "src/lib/services/person-record.test.ts",
  "src/lib/services/person-write.test.ts",
  "src/lib/services/player-answer-tokens.test.ts",
  "src/lib/services/player-home.test.ts",
  "src/lib/services/player-record.test.ts",
  "src/lib/services/recruitment-add.test.ts",
  "src/lib/services/recruitment-board.test.ts",
  "src/lib/services/recruitment-cycle-dispatch.test.ts",
  "src/lib/services/recruitment-cycle.test.ts",
  "src/lib/services/recruitment-interest-tokens.test.ts",
  "src/lib/services/recruitment-prospect.test.ts",
  "src/lib/services/recruitment-questionnaire.test.ts",
  "src/lib/services/recruitment-signup-codes.test.ts",
  "src/lib/services/recruitment-signup.test.ts",
  "src/lib/services/roster-board.test.ts",
  "src/lib/services/roster.test.ts",
  "src/lib/services/rsvp-tokens.test.ts",
  "src/lib/services/rsvp.test.ts",
  "src/lib/services/seasons.test.ts",
  "src/lib/services/weekly-report.test.ts",
  "tests/auth-flow.test.ts",
  "tests/auth-recovery-flow.test.ts",
  "tests/calendar-feed-side-effects.test.ts",
  "tests/hosted-role-posture.test.ts",
  "tests/link-test-operator.test.ts",
  "tests/operator-capability-catalogue.test.ts",
  "tests/person-merge-reference-catalogue.test.ts",
  "tests/pilot-scenario-lan-110.test.ts",
  "tests/pilot-scenario-lan-74.test.ts",
  "tests/pilot-scenario-lan-75.test.ts",
  "tests/pilot-scenario-lan-76.test.ts",
  "tests/pilot-scenario-lan-77.test.ts",
  "tests/pilot-scenario-lan-78.test.ts",
  "tests/pilot-scenario-lan-79.test.ts",
  "tests/pilot-scenario-lan-80.test.ts",
  "tests/pilot-scenario-lan-81.test.ts",
  "tests/pilot-scenario-lan-82.test.ts",
  "tests/pilot-scenario-lan-93.test.ts",
  "tests/production-bootstrap-database.test.ts",
  "tests/production-smoke-contract.test.ts",
  "tests/public-calendar-side-effects.test.ts",
  "tests/rls-posture.test.ts",
  "tests/role-catalogue.test.ts",
  "tests/schema-accepts.test.ts",
  "tests/schema-event-audience.test.ts",
  "tests/schema-events-target-state.test.ts",
  "tests/schema-invariants.test.ts",
  "tests/schema-legacy-vocabulary-mapping.test.ts",
  "tests/schema-operator-accounts.test.ts",
  "tests/schema-recruitment.test.ts",
  "tests/schema-restricted-fields.test.ts",
  "tests/schema-rsvp-delivery.test.ts",
  "tests/schema-security.test.ts",
  "tests/service-layer-audit.test.ts",
  "tests/service-layer-error-mapping.test.ts",
  "tests/service-layer-transactions.test.ts",
  "tests/showcase-loader.test.ts",
  "tests/slice-walkthrough.test.ts",
  "tests/synthetic-seed-messiness.test.ts",
  "tests/synthetic-seed.test.ts",
];

/**
 * Expensive, serialized checks that run once at the package gate and in CI,
 * not during each implementation/correction iteration. Security-perimeter
 * suites are deliberately absent even when they are database-backed.
 */
export const GATE_SUITES: readonly string[] = [
  "tests/local-supabase-coordinator.test.ts",
  "tests/pilot-scenario-lan-110.test.ts",
  "tests/pilot-scenario-lan-74.test.ts",
  "tests/pilot-scenario-lan-75.test.ts",
  "tests/pilot-scenario-lan-76.test.ts",
  "tests/pilot-scenario-lan-77.test.ts",
  "tests/pilot-scenario-lan-78.test.ts",
  "tests/pilot-scenario-lan-79.test.ts",
  "tests/pilot-scenario-lan-80.test.ts",
  "tests/pilot-scenario-lan-81.test.ts",
  "tests/pilot-scenario-lan-82.test.ts",
  "tests/pilot-scenario-lan-93.test.ts",
  "tests/production-bootstrap-database.test.ts",
  "tests/showcase-loader.test.ts",
  "tests/synthetic-seed-messiness.test.ts",
];

const HOT_DATABASE_SUITES = DATABASE_TEST_SUITES.filter((suite) => !GATE_SUITES.includes(suite));

const ALL_TEST_FILES = ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"];

/**
 * Shared between both projects.
 *
 * Inline projects do not inherit the root Vite configuration, so the alias and
 * the environment are spread into each one rather than declared once above.
 *
 * JSX is compiled by Vite's built-in esbuild using the automatic runtime from
 * tsconfig (`"jsx": "react-jsx"`). No React plugin is needed: these tests do not
 * use Fast Refresh, and adding one pulls in a second, conflicting Vite version.
 */
const shared = {
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
};

export default defineConfig({
  test: {
    projects: [
      {
        ...shared,
        test: {
          ...shared.test,
          name: "unit",
          include: [...ALL_TEST_FILES],
          // Everything Vitest excludes by default, plus every database suite —
          // those belong to the project below and must not also run here.
          exclude: [...configDefaults.exclude, ...DATABASE_TEST_SUITES, ...GATE_SUITES],
        },
      },
      {
        ...shared,
        test: {
          ...shared.test,
          name: "database",
          include: [...HOT_DATABASE_SUITES],
          // One fork, so these files run one at a time against the one local
          // database. `isolate` stays on, so each file still gets a fresh module
          // registry — the serialization is of database access, not of state.
          //
          // `fileParallelism` cannot be set per project (Vitest treats it as a
          // root-only option), which is why this is expressed as a pool option.
          //
          // The pool is named explicitly because `poolOptions` is keyed by it:
          // `poolOptions.forks` is read only when the pool is forks, so the two
          // lines below only mean anything together.
          pool: "forks" as const,
          poolOptions: { forks: { singleFork: true } },
          // Read by `vitest.setup.ts`: this is the project that is allowed to
          // open a connection.
          env: { LANCERS_TEST_PROJECT: "database" },
        },
      },
      {
        ...shared,
        test: {
          ...shared.test,
          name: "gate",
          include: [...GATE_SUITES],
          pool: "forks" as const,
          poolOptions: { forks: { singleFork: true } },
          env: {
            LANCERS_TEST_PROJECT: "database",
            PILOT_GUARD_CHECK: "1",
          },
        },
      },
    ],
  },
});
