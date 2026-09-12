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
import { CONSENT_SOURCE_FOR_CAPTURE_SOURCE } from "../scripts/production/showcase/plan/recruitment.mjs";
import { testExisting, testParams } from "./helpers/showcase-fixture.mjs";
import { buildAcademicYear } from "@/lib/services/oxford-year";
import { allowedItemStates } from "@/lib/services/onboarding-item-shapes";

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
    // `public.club_link_tokens` is deliberately absent — LAN-241. A club
    // link's plaintext is signed with the deployment's `CLUB_LINK_SECRET`,
    // which the parameter file does not hold and must not, so a link this
    // loader minted could never be re-derived and was refused at every door it
    // was presented at. The loader writes none, and the assertion below —
    // "every token this plan writes is a digest derived from the secret" — is
    // vacuously true for a table it no longer writes to. The `plan` assertion
    // that it writes none at all lives in `showcase-loader.test.ts`.
    for (const table of ["public.rsvp_access_tokens", "public.person_access_tokens"]) {
      const rows = plan.rows.filter((row: Row) => row.table === table) as Row[];
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(String(row.columns.token_hash)).toMatch(/^[0-9a-f]{64}$/);
    }
    const link = plan.examples.get("link.rsvp.player") as string;
    expect(link).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = plan.rows.find(
      (row: Row) =>
        row.table === "public.rsvp_access_tokens" && row.columns.token_hash === tokenHash(link),
    );
    expect(stored, "the seat's live link is not the one stored").toBeDefined();
    // A different secret is a different link, so a public repository cannot
    // compute a live credential.
    expect(token("another-secret-entirely-0123", "rsvp_access_tokens", "x")).not.toBe(
      token("showcase-test-secret-0123456789", "rsvp_access_tokens", "x"),
    );
    expect(() => token("short", "rsvp_access_tokens", "x")).toThrow(/tokenSecret/);
  });

  it("issues live links only to the people the parameters permit", () => {
    const plan = build({ liveLinksFor: ["tester5"] });
    const seatPersonId = plan.context.operators.find(
      (operator: { key: string; personId: string }) => operator.key === "tester5",
    )!.personId;
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
      expect(person).toBe(seatPersonId);
    }
    const durable = plan.rows.filter(
      (row: Row) =>
        row.table === "public.person_access_tokens" &&
        !row.columns.single_use &&
        row.columns.revoked_at === null,
    ) as Row[];
    // One person, not one row: LAN-343 gave the events page and the onboarding
    // questionnaire a credential each, and dropped the index that used to allow
    // only one live durable row per person and season. What this still proves is
    // the thing that matters — no live link belongs to anybody but the seat.
    expect([...new Set(durable.map((row) => row.columns.person_id))]).toEqual([seatPersonId]);
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
    expect(nobody.examples.has("link.rsvp.player")).toBe(false);
  });
});

describe("a recruit's record never contradicts itself about how they were captured", () => {
  // LAN-238. `declareRecruitmentCycleJobsIn` gates the recruitment
  // questionnaire on the recruit's own grant *through the sign-up form*
  // (`Q-read-back-authorises-how-much`, Brian 2026-09-02), and nothing on the
  // record shows which door a grant came through. Every one of these was a
  // refusal, or a claimed send, that the screen gave a tester no way to explain.
  // The plan is built once. `buildPlan` is expensive enough that five more of
  // them in one file pushes its 5s-timeout neighbours over.
  let cached: ReturnType<typeof build> | null = null;
  const recruitment = () => {
    const plan = (cached ??= build());
    const rows = (table: string) =>
      (plan.rows as Row[]).filter((row) => row.table === table).map((row) => row.columns);
    const consentByPerson = new Map(
      rows("public.season_messaging_consents").map((c) => [c.person_id as string, c]),
    );
    const prospects = rows("public.recruitment_prospects");
    return {
      plan,
      rows,
      prospects,
      consentByPerson,
      viaForm: (personId: unknown) =>
        consentByPerson.get(personId as string)?.source === "qr_self_entry",
      name: (personId: unknown) => {
        const person = rows("public.people").find((p) => p.id === personId);
        return person ? `${person.given_name} ${person.family_name ?? ""}`.trim() : "(unknown)";
      },
    };
  };

  it("gives every recruit the consent provenance their capture source implies", () => {
    const { prospects, consentByPerson, name } = recruitment();
    expect(prospects.length).toBeGreaterThan(20);
    for (const prospect of prospects) {
      const consent = consentByPerson.get(prospect.person_id as string);
      if (!consent?.source) continue;
      expect(consent.source, `${name(prospect.person_id)} — captured as "${prospect.source}"`).toBe(
        CONSENT_SOURCE_FOR_CAPTURE_SOURCE[prospect.source as string],
      );
    }
  });

  it("leaves nobody captured on the sign-up form short of a grant", () => {
    // The form cannot be saved without the consent tick, so `asked` there is a
    // refusal the record gives no way to explain. `refused` and `withdrawn`
    // are different: both are reachable afterwards, and both are named on the
    // record in a banner.
    const { prospects, consentByPerson, name } = recruitment();
    for (const prospect of prospects) {
      if (prospect.source !== "QR sign-up at the Freshers' Fair") continue;
      const state = consentByPerson.get(prospect.person_id as string)?.state;
      expect(["asked", "never_asked"], name(prospect.person_id)).not.toContain(state);
    }
  });

  it("claims no recruitment questionnaire — ask, link or answer — without a sign-up-form grant", () => {
    const { rows, prospects, viaForm, name } = recruitment();
    const asks = rows("public.notification_jobs").filter((job) =>
      String(job.idempotency_key).startsWith("recruit-cycle:interest"),
    );
    expect(asks.length).toBeGreaterThan(0);
    for (const ask of asks) expect(viaForm(ask.person_id), name(ask.person_id)).toBe(true);

    const links = rows("public.person_access_tokens").filter(
      (token) => token.purpose === "recruit_interest_request",
    );
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(viaForm(link.person_id), name(link.person_id)).toBe(true);

    const prospectById = new Map(prospects.map((p) => [p.id as string, p]));
    const answered = new Set(
      rows("public.recruitment_questionnaire_responses").map((r) => r.prospect_id as string),
    );
    expect(answered.size).toBeGreaterThan(0);
    for (const prospectId of answered) {
      const personId = prospectById.get(prospectId)?.person_id;
      expect(viaForm(personId), name(personId)).toBe(true);
    }
  });

  it("sends the welcome only to the recruits who had not been through the form", () => {
    // The welcome carries the link to that form, so `welcomeStepComplete`
    // skips the track for anyone who has already used it.
    const { rows, consentByPerson, name } = recruitment();
    const welcomes = rows("public.notification_jobs").filter((job) =>
      /^recruit-cycle:(welcome|details_reminder):/.test(String(job.idempotency_key)),
    );
    expect(welcomes.length).toBeGreaterThan(0);
    for (const welcome of welcomes) {
      const consent = consentByPerson.get(welcome.person_id as string);
      expect(consent?.source, name(welcome.person_id)).not.toBe("qr_self_entry");
      expect(["refused", "withdrawn"]).not.toContain(consent?.state);
    }
  });

  it("shows the fields only the sign-up form collects on the recruits who filled it in", () => {
    const { rows, prospects, name } = recruitment();
    const people = new Map(rows("public.people").map((person) => [person.id as string, person]));
    for (const prospect of prospects) {
      const person = people.get(prospect.person_id as string);
      if (!person) continue;
      // Truthiness, not `!== null`: a person row built without these keys at
      // all (the near-duplicates) carries `undefined`, not null.
      const fromTheForm = Boolean(
        person.college || person.matriculation_year || person.degree_field,
      );
      if (!fromTheForm) continue;
      expect(prospect.source, name(prospect.person_id)).toBe("QR sign-up at the Freshers' Fair");
    }
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

describe("the Oxford year the environment is loaded with", () => {
  it("is both academic years, all six terms, on the real boundaries", () => {
    const plan = build();
    const terms = (plan.rows as Row[]).filter((row) => row.table === "public.terms");
    expect(
      terms.map((row) => [row.columns.name, row.columns.starts_on, row.columns.ends_on]),
    ).toEqual([
      ["michaelmas", "2025-09-28", "2025-12-06"],
      ["hilary", "2026-01-11", "2026-03-14"],
      ["trinity", "2026-04-19", "2026-06-20"],
      ["michaelmas", "2026-09-27", "2026-12-05"],
      ["hilary", "2027-01-10", "2027-03-13"],
      ["trinity", "2027-04-18", "2027-06-19"],
    ]);
    // Michaelmas runs from week −1; Hilary and Trinity from 0th (SDA §5.4).
    expect(terms.map((row) => row.columns.first_week)).toEqual([-1, 0, 0, -1, 0, 0]);
  });

  it("renders the whole year, which one term cannot", () => {
    const plan = build();
    const windows = (plan.rows as Row[])
      .filter((row) => row.table === "public.terms")
      .map((row) => ({
        id: String(row.columns.id),
        name: row.columns.name as "michaelmas" | "hilary" | "trinity",
        academicYear: String(row.columns.academic_year),
        startsOn: String(row.columns.starts_on),
        endsOn: String(row.columns.ends_on),
        firstWeek: Number(row.columns.first_week),
        lastWeek: Number(row.columns.last_week),
      }));
    const currentYear = windows[3].academicYear;
    const whole = buildAcademicYear(currentYear, windows, [], { today: "2026-11-01" });
    expect(whole.segments.map((segment) => segment.name)).toEqual([
      "Long Vacation",
      "michaelmas",
      "Christmas Vacation",
      "hilary",
      "Easter Vacation",
      "trinity",
      "Long Vacation",
    ]);

    // What the loader used to plant. The leading Long Vacation has no previous
    // Trinity to number its weeks from, and the year stops in December — which
    // is why all six rows are loaded rather than the one the term card names.
    const michaelmasOnly = buildAcademicYear(currentYear, [windows[3]], [], {
      today: "2026-11-01",
    });
    expect(michaelmasOnly.segments.map((segment) => segment.name)).toEqual([
      "michaelmas",
      "Christmas Vacation",
    ]);
  });
});

describe("every onboarding item the plan writes is a state that item can hold", () => {
  it("matches the application's own closed list, per item", () => {
    // Derived items are NOT skipped. They have no editable control, but the
    // record view still labels them, and `allowedItemStates` answers for them
    // too — the plain pending/complete fallback. Skipping them is what let a
    // derived item sit at `invited` and keep the record page throwing after the
    // first correction fixed every non-derived item.
    //
    // `itemStateLabel` throws on a state outside an item's list, so a plan that
    // waives something unwaivable does not render a slightly wrong page — it
    // takes out the roster board and every player record with a 500. This test
    // imports the application's own rule rather than restating it, so the plan
    // cannot drift from it again.
    const plan = build();
    const types = new Map(
      (plan.rows as Row[])
        .filter((row) => row.table === "public.onboarding_item_types")
        .map((row) => [String(row.columns.id), String(row.columns.code)]),
    );
    const illegal = new Map<string, number>();
    for (const row of plan.rows as Row[]) {
      if (row.table !== "public.onboarding_items") continue;
      const code = types.get(String(row.columns.item_type_id));
      if (!code) continue;
      const status = String(row.columns.status);
      if ((allowedItemStates(code) as readonly string[]).includes(status)) continue;
      const at = `${code}=${status}`;
      illegal.set(at, (illegal.get(at) ?? 0) + 1);
    }
    expect([...illegal]).toEqual([]);
  });

  it("writes no item history into a state its item cannot hold either", () => {
    const plan = build();
    const types = new Map(
      (plan.rows as Row[])
        .filter((row) => row.table === "public.onboarding_item_types")
        .map((row) => [String(row.columns.id), String(row.columns.code)]),
    );
    const itemCode = new Map(
      (plan.rows as Row[])
        .filter((row) => row.table === "public.onboarding_items")
        .map((row) => [String(row.columns.id), types.get(String(row.columns.item_type_id))]),
    );
    const illegal: string[] = [];
    for (const row of plan.rows as Row[]) {
      if (row.table !== "public.onboarding_item_history") continue;
      const code = itemCode.get(String(row.columns.onboarding_item_id));
      if (!code) continue;
      for (const field of ["from_status", "to_status"]) {
        const status = row.columns[field];
        if (status === null || status === undefined) continue;
        if ((allowedItemStates(code) as readonly string[]).includes(String(status))) continue;
        illegal.push(`${code}.${field}=${String(status)}`);
      }
    }
    expect([...new Set(illegal)]).toEqual([]);
  });
});
