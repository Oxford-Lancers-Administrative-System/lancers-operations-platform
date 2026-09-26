// @vitest-environment node
/**
 * The player record's server-side omission — LAN-432, W3 of mission
 * M-GRANULAR-ROLES-AND-PERMISSIONS (LAN-423).
 *
 * "A `none` section stays in its place, collapsed, a lock in place of the
 * chevron, and its contents are never in the server response." This suite
 * proves the last clause against the real local database: it runs the real
 * page (`/operate/roster/[membershipId]`) as the Kit Manager of W3-01 — View
 * on Person, Edit on Kit, None on everything else — and inspects exactly what
 * the page hands its client component. Those props are what React serialises
 * into the RSC payload and the HTML, so a value absent from them cannot reach
 * the browser. The same page rendered to HTML is checked too.
 *
 * The suite mints its own person, contacts, emergency contact and membership,
 * tagged with a marker unique to this file, and deletes every row it wrote.
 * Every name and number below is invented for it.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("not-found");
  }),
}));

import type { Client } from "pg";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { closePool, withTransaction } from "@/lib/db";
import { resolveOperatorAccess } from "@/lib/auth/operator";
import { mergeGrantRows, type GrantRow, type OperatorGrants } from "@/lib/auth/grants";
import { resolveOpenSeason } from "@/lib/services/roster";
import PlayerRecordPage from "@/app/operate/roster/[membershipId]/page";
import { openObserver, seededActorPersonId } from "./helpers/service-layer";

const MARKER = "LAN432Payload";
const MOBILE = "+447700900432";
const PERSONAL_EMAIL = "lan432.payload.personal@example.invalid";
const EMERGENCY_NAME = "Wystan";
const EMERGENCY_PHONE = "+447700900987";
const EMERGENCY_EMAIL = "lan432.payload.emergency@example.invalid";
const DEGREE = "LAN432 Payload Studies";
/** An event this membership was invited to and attended: its name is an attendance row's (round 6, M5). */
const ATTENDANCE_EVENT = "Quillfeather Register Drill";

let observer: Client;
let actorPersonId: string;
let personId: string;
let membershipId: string;
let eventId: string;
let audienceMemberId: string;
let invitationId: string;

function roster(levels: Record<string, string>): OperatorGrants {
  const rows: GrantRow[] = Object.entries(levels).map(([key, level]) => ({
    subject_kind: "roster_category",
    subject_key: key,
    template_id: null,
    level,
  }));
  return mergeGrantRows(rows);
}

/** W3-01's Kit Manager: View on Person, Edit on Kit, None everywhere else. */
const KIT_MANAGER = roster({ person: "view", kit: "edit" });

function signInAs(grants: OperatorGrants): void {
  vi.mocked(resolveOperatorAccess).mockResolvedValue({
    state: "active",
    operator: {
      authUserId: "00000000-4320-4432-8432-000000000432",
      personId: actorPersonId,
      displayName: "Payload Operator",
      roleCodes: [],
      grants,
      isActive: true,
    },
  });
}

async function renderPage(): Promise<ReactElement<Record<string, unknown>>> {
  return (await PlayerRecordPage({
    params: Promise.resolve({ membershipId }),
    searchParams: Promise.resolve({}),
  } as unknown as Parameters<typeof PlayerRecordPage>[0])) as ReactElement<Record<string, unknown>>;
}

async function cleanUp(): Promise<void> {
  if (eventId) {
    await observer.query(`delete from public.attendance_records where event_id = $1::uuid`, [
      eventId,
    ]);
    if (invitationId) {
      await observer.query(`delete from public.invitations where id = $1::uuid`, [invitationId]);
    }
    if (audienceMemberId) {
      await observer.query(`delete from public.event_audience_members where id = $1::uuid`, [
        audienceMemberId,
      ]);
    }
    await observer.query(`delete from public.events where id = $1::uuid`, [eventId]);
  }
  if (membershipId) {
    for (const table of [
      "onboarding_item_history",
      "onboarding_items",
      "season_membership_status_events",
    ]) {
      await observer.query(`delete from public.${table} where season_membership_id = $1::uuid`, [
        membershipId,
      ]);
    }
    await observer.query(`delete from public.season_memberships where id = $1::uuid`, [
      membershipId,
    ]);
  }
  if (personId) {
    await observer.query(
      `delete from public.person_emergency_contacts where person_id = $1::uuid`,
      [personId],
    );
    await observer.query(`delete from public.contact_points where person_id = $1::uuid`, [
      personId,
    ]);
    await observer.query(`delete from public.people where id = $1::uuid`, [personId]);
  }
}

beforeAll(async () => {
  observer = await openObserver();
  actorPersonId = await seededActorPersonId(observer);
  const season = await withTransaction((tx) => resolveOpenSeason(tx));

  const person = await observer.query<{ id: string }>(
    `insert into public.people (given_name, family_name, degree_field)
     values ($1, 'Quillfeather', $2) returning id`,
    [MARKER, DEGREE],
  );
  personId = person.rows[0].id;
  await observer.query(
    `insert into public.contact_points (person_id, kind, raw_value, is_preferred, source)
     values ($1::uuid, 'phone', $2, true, 'test fixture')`,
    [personId, MOBILE],
  );
  await observer.query(
    `insert into public.contact_points (person_id, kind, scope, raw_value, is_preferred, source)
     values ($1::uuid, 'email', 'personal', $2, true, 'test fixture')`,
    [personId, PERSONAL_EMAIL],
  );
  await observer.query(
    `insert into public.person_emergency_contacts
       (person_id, given_name, family_name, relationship, phone, email, recorded_by_person_id)
     values ($1::uuid, $2, 'Quillfeather', 'Parent', $3, $4, $5::uuid)`,
    [personId, EMERGENCY_NAME, EMERGENCY_PHONE, EMERGENCY_EMAIL, actorPersonId],
  );
  const membership = await observer.query<{ id: string }>(
    `insert into public.season_memberships (person_id, season_id, status, entry, activated_on)
     values ($1::uuid, $2::uuid, 'active', 'new', current_date) returning id`,
    [personId, season.id],
  );
  membershipId = membership.rows[0].id;

  // One attended event, so the record's Attendance section has a row to send
  // or withhold (LAN-423 round 6, M5).
  const event = await observer.query<{ id: string }>(
    `insert into public.events (
       season_id, name, event_type, status, scheduled_on, is_mandatory,
       audience_confirmed_at, audience_confirmed_by_person_id, approved_at, approved_by_person_id, template_id)
     values ($1::uuid, $2, 'practice', 'approved', current_date - 7, true,
             now(), $3::uuid, now(), $3::uuid,
             (select tpl.id from public.event_templates tpl where tpl.event_type = 'practice' order by lower(tpl.name) limit 1))
     returning id`,
    [season.id, ATTENDANCE_EVENT, actorPersonId],
  );
  eventId = event.rows[0].id;
  const audience = await observer.query<{ id: string }>(
    `insert into public.event_audience_members
       (event_id, season_id, capacity, season_membership_id, invitee_person_id, added_by_person_id)
     values ($1::uuid, $2::uuid, 'player', $3::uuid, $4::uuid, $5::uuid) returning id`,
    [eventId, season.id, membershipId, personId, actorPersonId],
  );
  audienceMemberId = audience.rows[0].id;
  const invitation = await observer.query<{ id: string }>(
    `insert into public.invitations (
       event_id, event_status, season_id, audience_member_id,
       capacity, season_membership_id, status, issued_at)
     values ($1::uuid, 'approved', $2::uuid, $3::uuid, 'player', $4::uuid, 'expired', now())
     returning id`,
    [eventId, season.id, audienceMemberId, membershipId],
  );
  invitationId = invitation.rows[0].id;
  await observer.query(
    `insert into public.attendance_records (event_id, event_status, season_id, capacity, season_membership_id, presence, recorded_by_person_id)
     values ($1::uuid, 'approved', $2::uuid, 'player', $3::uuid, 'present', $4::uuid)`,
    [eventId, season.id, membershipId, actorPersonId],
  );
});

afterAll(async () => {
  await cleanUp();
  await observer.end();
  await closePool();
});

/** Every string that belongs to Contact & emergency on this record. */
const CONTACT_STRINGS = [
  MOBILE,
  "7700900432",
  PERSONAL_EMAIL,
  EMERGENCY_NAME,
  EMERGENCY_PHONE,
  "7700900987",
  EMERGENCY_EMAIL,
];

describe("the player record as the Kit Manager — contents of a None section never leave the server", () => {
  it("hands the client component no mobile, personal email or emergency contact", async () => {
    signInAs(KIT_MANAGER);
    const element = await renderPage();
    const payload = JSON.stringify(element.props);

    for (const value of CONTACT_STRINGS) expect(payload, value).not.toContain(value);
    // Person is View: its own facts do travel, so the page was really read.
    expect(payload).toContain(DEGREE);
  });

  it("omits every None category's keys from the record, attendance included", async () => {
    signInAs(KIT_MANAGER);
    const element = await renderPage();
    const record = element.props.record as Record<string, unknown>;
    const person = element.props.person as Record<string, unknown>;

    // Contact & emergency: absent from the person half.
    expect("contacts" in person).toBe(false);
    expect("emergencyContact" in person).toBe(false);
    // Membership and Onboarding: absent from the record.
    for (const key of ["status", "entry", "statusHistory", "otherSeasons", "onboardingItems"]) {
      expect(key in record, key).toBe(false);
    }
    // The six football groups and Availability: absent from the season facts.
    const season = record.season as Record<string, unknown>;
    expect(Object.keys(season).sort()).toEqual(["formalwear", "kit"]);
    // Attendance is a roster line since round 6 (M5): at None, not sent.
    expect("attendance" in record).toBe(false);
    expect(JSON.stringify(element.props)).not.toContain(ATTENDANCE_EVENT);
    expect(record.access).toMatchObject({
      person: "view",
      kit: "edit",
      contact_emergency: "none",
      attendance: "none",
    });
  });

  it("renders to HTML with Contact & emergency locked and none of its values", async () => {
    signInAs(KIT_MANAGER);
    const html = renderToStaticMarkup(await renderPage());
    for (const value of CONTACT_STRINGS) expect(html, value).not.toContain(value);
    expect(html).toContain('data-testid="section-contact-emergency"');
    expect(html).toMatch(/data-testid="section-contact-emergency"[^>]*data-locked="true"/);
    expect(html).toContain("Attendance");
    // Round 6, M5: Attendance at None is a locked head with no rows.
    expect(html).toMatch(/data-testid="section-attendance"[^>]*data-locked="true"/);
    expect(html).not.toContain(ATTENDANCE_EVENT);
  });

  it("sends the attendance rows to a seat holding Attendance at view", async () => {
    signInAs(roster({ person: "view", kit: "edit", attendance: "view" }));
    const element = await renderPage();
    const record = element.props.record as Record<string, unknown>;

    expect(Array.isArray(record.attendance)).toBe(true);
    expect(JSON.stringify(element.props)).toContain(ATTENDANCE_EVENT);
    const html = renderToStaticMarkup(element);
    expect(html).toContain(ATTENDANCE_EVENT);
    expect(html).not.toMatch(/data-testid="section-attendance"[^>]*data-locked="true"/);
  });

  it("sends the same values to a seat holding Contact & emergency at view", async () => {
    signInAs(roster({ person: "view", contact_emergency: "view", kit: "edit" }));
    const payload = JSON.stringify((await renderPage()).props);
    expect(payload).toContain(MOBILE);
    expect(payload).toContain(EMERGENCY_EMAIL);
  });

  it("refuses a seat holding no roster category at all", async () => {
    signInAs(roster({}));
    const html = renderToStaticMarkup(await renderPage());
    expect(html).not.toContain(DEGREE);
    for (const value of CONTACT_STRINGS) expect(html, value).not.toContain(value);
  });
});
