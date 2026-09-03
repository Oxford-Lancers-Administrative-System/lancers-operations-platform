// @vitest-environment node
/**
 * The tester-week plan, as a pure function — LAN-221, Part 2.
 *
 * No database. What is proved here is what has to be true before the loader
 * touches anything: the plan is deterministic, every identifier is unique,
 * nothing in it can be delivered to a real person, no job in it is one the
 * sweep would dispatch, every token is stored only as a digest, and every
 * live link is one the parameters permit.
 */
import { describe, expect, it } from "vitest";

import { buildPlan } from "../scripts/production/showcase/plan.mjs";
import { syntheticTermCard } from "../scripts/production/showcase/sources.mjs";
import { token, tokenHash } from "../scripts/production/showcase/ids.mjs";
import { NO_USABLE_NUMBER_REASON } from "../scripts/production/showcase/plan/calendar.mjs";
import { testExisting, testParams } from "./helpers/showcase-fixture.mjs";

type Row = { table: string; columns: Record<string, unknown> };

const build = (overrides = {}, anchor = "2026-09-03") =>
  buildPlan({
    termCard: syntheticTermCard(),
    params: testParams(overrides),
    existing: testExisting(),
    anchor,
  });

describe("determinism", () => {
  it("builds the same rows, in the same order, twice", () => {
    const a = build();
    const b = build();
    expect(a.rows.length).toBe(b.rows.length);
    expect(a.rows.map((row: Row) => `${row.table}:${row.columns.id}`)).toEqual(
      b.rows.map((row: Row) => `${row.table}:${row.columns.id}`),
    );
    expect(JSON.stringify([...a.examples])).toBe(JSON.stringify([...b.examples]));
  });

  it("gives every row a unique identifier within its table", () => {
    const plan = build();
    const seen = new Set<string>();
    for (const row of plan.rows as Row[]) {
      const key = `${row.table}:${row.columns.id}`;
      expect(seen.has(key), `duplicate ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it("writes the same identifiers whatever the anchor, so links written early still resolve", () => {
    const a = build({}, "2026-09-03");
    const b = build({}, "2026-09-10");
    const ids = (plan: { rows: Row[] }, table: string) =>
      plan.rows
        .filter((row) => row.table === table)
        .map((row) => row.columns.id)
        .sort();
    expect(ids(a, "public.people")).toEqual(ids(b, "public.people"));
    expect(ids(a, "public.recruitment_prospects")).toEqual(ids(b, "public.recruitment_prospects"));
    expect(a.examples.get("person.player.first")).toBe(b.examples.get("person.player.first"));
  });
});

describe("nothing deliverable to a real person", () => {
  it("uses only reserved telephone ranges and reserved email domains, apart from the parameters' own", () => {
    const plan = build();
    const contacts = plan.rows.filter((row: Row) => row.table === "public.contact_points") as Row[];
    expect(contacts.length).toBeGreaterThan(80);
    for (const row of contacts) {
      const value = String(row.columns.raw_value).trim();
      if (row.columns.source === "supplied privately at execution time") continue;
      if (row.columns.kind === "phone") {
        expect(value, value).toMatch(/^(\+44 ?|0)?7700 ?90\d{3,4}$|^\+1 555 01\d{2}$/);
      } else {
        expect(value, value).toMatch(/\.example$/);
      }
    }
    const emergency = plan.rows.filter(
      (row: Row) => row.table === "public.person_emergency_contacts",
    ) as Row[];
    for (const row of emergency) {
      expect(String(row.columns.phone)).toMatch(/^07700 900\d{3}$/);
      if (row.columns.email) expect(String(row.columns.email)).toMatch(/\.example$/);
    }
  });

  it("plans no job the automatic sweep would dispatch", () => {
    const plan = build();
    const jobs = plan.rows.filter((row: Row) => row.table === "public.notification_jobs") as Row[];
    expect(jobs.length).toBeGreaterThan(1000);
    const sweepable = jobs.filter((row) => {
      const c = row.columns;
      if (c.held_at) return false;
      if (Number(c.attempt_count) >= 5) return false;
      if (c.status === "pending" || c.status === "ready") return true;
      return c.status === "failed" && c.next_attempt_at !== null;
    });
    expect(sweepable.map((row) => row.columns.idempotency_key)).toEqual([]);
    // And the held ones really are held, attributed, with a reason.
    const held = jobs.filter((row) => row.columns.held_at);
    expect(held.length).toBeGreaterThan(0);
    for (const row of held) {
      expect(row.columns.held_reason).toBeTruthy();
      expect(row.columns.held_by_person_id).toBeTruthy();
    }
  });

  it("carries the no-route reason verbatim, so the delivery page names the exception", () => {
    const plan = build();
    const noRoute = plan.rows.filter(
      (row: Row) =>
        row.table === "public.notification_jobs" &&
        row.columns.last_error === NO_USABLE_NUMBER_REASON,
    );
    expect(noRoute.length).toBeGreaterThan(0);
  });

  it("stores every token as a SHA-256 digest and derives it from the secret", () => {
    const plan = build();
    for (const table of [
      "public.rsvp_access_tokens",
      "public.person_access_tokens",
      "public.club_link_tokens",
    ]) {
      const rows = plan.rows.filter((row: Row) => row.table === table) as Row[];
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(String(row.columns.token_hash)).toMatch(/^[0-9a-f]{64}$/);
    }
    const link = plan.examples.get("link.rsvp.brian") as string;
    expect(link).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = plan.rows.find(
      (row: Row) =>
        row.table === "public.rsvp_access_tokens" && row.columns.token_hash === tokenHash(link),
    );
    expect(stored, "Brian's live link is not the one stored").toBeDefined();
    // A different secret is a different link, so a public repository cannot
    // compute a live credential.
    expect(token("another-secret-entirely-0123", "rsvp_access_tokens", "x")).not.toBe(
      token("showcase-test-secret-0123456789", "rsvp_access_tokens", "x"),
    );
    expect(() => token("short", "rsvp_access_tokens", "x")).toThrow(/tokenSecret/);
  });

  it("issues live links only to the people the parameters permit", () => {
    const plan = build({ liveLinksFor: ["brian"] });
    const brian = plan.context.actorPersonId;
    const nowIso = "2026-09-03T00:00:00Z";
    const rsvp = plan.rows.filter((row: Row) => row.table === "public.rsvp_access_tokens") as Row[];
    const invitations = new Map(
      (plan.rows.filter((row: Row) => row.table === "public.invitations") as Row[]).map((row) => [
        row.columns.id,
        row.columns,
      ]),
    );
    const memberships = new Map(
      (plan.rows.filter((row: Row) => row.table === "public.season_memberships") as Row[]).map(
        (row) => [row.columns.id, row.columns],
      ),
    );
    const live = rsvp.filter(
      (row) => row.columns.revoked_at === null && String(row.columns.expires_at) > nowIso,
    );
    expect(live.length).toBeGreaterThan(0);
    for (const row of live) {
      const invitation = invitations.get(row.columns.invitation_id)!;
      const person =
        invitation.person_id ??
        memberships.get(invitation.season_membership_id as string)?.person_id;
      expect(person).toBe(brian);
    }
    const durable = plan.rows.filter(
      (row: Row) =>
        row.table === "public.person_access_tokens" &&
        !row.columns.single_use &&
        row.columns.revoked_at === null,
    ) as Row[];
    expect(durable.map((row) => row.columns.person_id)).toEqual([brian]);
    const singleUse = plan.rows.filter(
      (row: Row) => row.table === "public.person_access_tokens" && row.columns.single_use,
    ) as Row[];
    for (const row of singleUse)
      expect(row.columns.single_use_at !== null || row.columns.revoked_at !== null).toBe(true);

    const nobody = build({ liveLinksFor: [] });
    const noneLive = (nobody.rows as Row[]).filter(
      (row) =>
        row.table === "public.rsvp_access_tokens" &&
        row.columns.revoked_at === null &&
        String(row.columns.expires_at) > nowIso,
    );
    expect(noneLive).toEqual([]);
    expect(nobody.examples.has("link.rsvp.brian")).toBe(false);
  });
});

describe("the shape the ticket asks for", () => {
  it("is a full term with every membership status, funnel stage and event type", () => {
    const plan = build();
    const count = (
      table: string,
      predicate: (c: Record<string, unknown>) => boolean = () => true,
    ) => (plan.rows as Row[]).filter((row) => row.table === table && predicate(row.columns)).length;
    expect(count("public.people")).toBeGreaterThanOrEqual(60);
    expect(count("public.season_memberships", (c) => c.status === "active")).toBeGreaterThanOrEqual(
      25,
    );
    for (const status of ["active", "inactive", "onboarding", "departed", "archived"]) {
      expect(
        count("public.season_memberships", (c) => c.status === status),
        status,
      ).toBeGreaterThan(0);
    }
    for (const status of [
      "identified",
      "engaged",
      "committed",
      "joined",
      "declined",
      "disengaged",
      "void",
    ]) {
      expect(
        count("public.recruitment_prospects", (c) => c.status === status),
        status,
      ).toBeGreaterThan(0);
    }
    for (const type of [
      "practice",
      "strength_and_conditioning",
      "chalk",
      "game",
      "social",
      "recruitment",
      "meeting",
    ]) {
      expect(
        count("public.events", (c) => c.event_type === type),
        type,
      ).toBeGreaterThan(0);
    }
    expect(count("public.events")).toBeGreaterThanOrEqual(60);
    expect(count("public.events", (c) => c.term_id !== null)).toBeGreaterThan(30);
    expect(count("public.onboarding_items")).toBe(
      count("public.season_memberships", (c) => c.status !== "archived") * 11,
    );
    expect(plan.notes).toEqual([]);
  });

  it("declines a seat somebody else already holds rather than contesting it", () => {
    const existing = testExisting();
    existing.assignments.set("treasurer", [
      {
        id: "99999999-9999-4999-8999-999999999999",
        personId: "88888888-8888-4888-8888-888888888888",
      },
    ]);
    const plan = buildPlan({
      termCard: syntheticTermCard(),
      params: testParams(),
      existing,
      anchor: "2026-09-03",
    });
    expect(plan.notes.join("\n")).toMatch(/treasurer seat is already held/);
    const treasurer = (plan.rows as Row[]).filter(
      (row) =>
        row.table === "public.role_assignments" &&
        row.columns.role_id === existing.roles.get("treasurer")!.id,
    );
    expect(treasurer).toEqual([]);
  });
});
