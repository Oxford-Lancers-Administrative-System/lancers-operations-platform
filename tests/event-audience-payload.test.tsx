// @vitest-environment node
/**
 * The audience builder's per-person detail — LAN-423 fix round 1, F2.
 *
 * Choosing an event's audience needs Manage on its template and nothing on the
 * roster, so the Social Secretary (Manage on Social, None on every roster and
 * recruiting line) reached a catalogue carrying every member's phone or email,
 * membership status, unit and recruit status. This suite renders the real page
 * (`/operate/events/[id]?step=audience`, then `?step=review`) against the local
 * database as that seat, and asserts none of those values is in the props or
 * the HTML while the names and the group structure still are.
 *
 * Fix round 2 (G3, G4) adds the three other pages that carry the catalogue —
 * the amend page's Add people list and both template editors' candidate
 * counts — and the review step's unreachable panel, whose names are a contact
 * fact: the Social Secretary sees the count alone.
 *
 * The suite creates its own Social draft and one approved Social event, tagged
 * with a marker unique to this file, and deletes every row it wrote.
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

import { closePool } from "@/lib/db";
import { resolveOperatorAccess } from "@/lib/auth/operator";
import { mergeGrantRows, type GrantRow, type OperatorGrants } from "@/lib/auth/grants";
import { seededGrantsFor } from "@/lib/auth/capabilities";
import { createEventDraft } from "@/lib/services/events";
import {
  approveEvent,
  readApprovalPreview,
  saveEventAudience,
} from "@/lib/services/event-approval";
import { readAddableAudience } from "@/lib/services/event-audience-amendment";
import {
  DEFAULT_TEMPLATE_CLASS,
  readTemplateAudienceCatalogue,
} from "@/lib/services/event-templates";
import { NO_USABLE_NUMBER_REASON } from "@/lib/delivery/phone";
import {
  audienceOptionsForEventType,
  groupSelectionKeys,
  type AudienceCandidate,
} from "@/lib/services/audience-selection";
import { redactAudienceCandidates } from "@/lib/services/event-audience-access";
import EventDetailPage from "@/app/operate/events/[id]/page";
import AmendEventPage from "@/app/operate/events/[id]/amend/page";
import EventTemplatePage from "@/app/operate/events/templates/[templateId]/page";
import NewEventTemplatePage from "@/app/operate/events/templates/new/page";
import { openObserver, seededActorPersonId } from "./helpers/service-layer";

const MARKER = "LAN423AudiencePayload";
const SOCIAL_TEMPLATE_ID = "8de00424-52a8-52ad-9c9f-a29823f9c4bf";

let observer: Client;
let actorPersonId: string;
let eventId: string;
let candidates: readonly AudienceCandidate[];
let contactValues: string[];
let amendEventId: string;
let unreachableNames: string[];

type Element = ReactElement<Record<string, unknown>>;

/** The Social Secretary: Manage on Social, None on everything else. */
const SOCIAL_SECRETARY: OperatorGrants = mergeGrantRows([
  {
    subject_kind: "event_template",
    subject_key: null,
    template_id: SOCIAL_TEMPLATE_ID,
    level: "manage",
  },
] satisfies GrantRow[]);

/** The same seat, plus Contact & emergency at View. */
const SOCIAL_SECRETARY_WITH_CONTACT: OperatorGrants = mergeGrantRows([
  {
    subject_kind: "event_template",
    subject_key: null,
    template_id: SOCIAL_TEMPLATE_ID,
    level: "manage",
  },
  {
    subject_kind: "roster_category",
    subject_key: "contact_emergency",
    template_id: null,
    level: "view",
  },
] satisfies GrantRow[]);

/**
 * The template editors also ask for `event_calendar_management`, a role
 * capability; the Secretary's code opens them while the grants stay the Social
 * Secretary's, which are what the redaction reads.
 */
const TEMPLATE_ROLE_CODES = ["secretary"];

function signInAs(grants: OperatorGrants, roleCodes: string[] = []): void {
  vi.mocked(resolveOperatorAccess).mockResolvedValue({
    state: "active",
    operator: {
      authUserId: "00000000-4230-4423-8423-000000000424",
      personId: actorPersonId,
      displayName: "Payload Operator",
      roleCodes,
      grants,
      isActive: true,
    },
  });
}

async function renderStep(step: string): Promise<ReactElement<Record<string, unknown>>> {
  return (await EventDetailPage({
    params: Promise.resolve({ id: eventId }),
    searchParams: Promise.resolve({ step }),
  } as unknown as Parameters<typeof EventDetailPage>[0])) as ReactElement<Record<string, unknown>>;
}

function contactsOf(list: readonly AudienceCandidate[]): string[] {
  return list.map((candidate) => candidate.contact).filter((value): value is string => !!value);
}

/** No contact, standing, unit or recruit status value in the props or the HTML. */
function expectNoMemberDetail(element: Element, contacts: readonly string[]): void {
  const payload = propsOf(element);
  const html = renderToStaticMarkup(element);
  expect(contacts.length).toBeGreaterThan(5);
  for (const value of contacts) {
    expect(payload, value).not.toContain(value);
    expect(html, value).not.toContain(value);
  }
  expect(payload).not.toMatch(/"standing":"(Active|Onboarding|Inactive|Departed)"/);
  expect(payload).not.toMatch(/"unit":"(Both|Offence|Defence|Special teams)"/);
  expect(payload).not.toMatch(/"recruitStatus":"/);
  expect(payload).not.toMatch(/"isBps":/);
  expect(html).not.toMatch(/· (Active|Onboarding|Both|Offence|Defence) ·/);
}

/** Every string in a rendered element tree's props, recursively. */
function propsOf(element: ReactElement<Record<string, unknown>>): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(element, (key, value: unknown) => {
    if (key === "_owner" || key === "_store") return undefined;
    if (typeof value === "function") return undefined;
    if (value && typeof value === "object") {
      if (seen.has(value)) return undefined;
      seen.add(value);
    }
    return value;
  });
}

beforeAll(async () => {
  observer = await openObserver();
  actorPersonId = await seededActorPersonId(observer);
  const event = await createEventDraft(actorPersonId, {
    name: `${MARKER} Social`,
    templateId: SOCIAL_TEMPLATE_ID,
    scheduledOn: "2026-11-14",
    startsAt: "19:00",
    endsAt: "22:00",
    venue: "College bar",
    isMandatory: false,
    deliveryMode: "in_person",
    description: null,
    requiredEquipment: null,
    joiningUrl: null,
  });
  eventId = event.id;
  candidates = (await readApprovalPreview(eventId)).catalogue.candidates;
  await saveEventAudience(
    actorPersonId,
    eventId,
    candidates.map((candidate) => candidate.key),
  );
  contactValues = contactsOf(candidates);
  unreachableNames = (await readApprovalPreview(eventId)).unreachable.map(
    (entry) => entry.member.displayName,
  );

  // G3: an approved Social event ahead, holding two players, so the rest of
  // the catalogue is the amend page's Add people list.
  const approved = await createEventDraft(actorPersonId, {
    name: `${MARKER} Social approved`,
    templateId: SOCIAL_TEMPLATE_ID,
    scheduledOn: "2026-11-21",
    startsAt: "19:00",
    endsAt: "22:00",
    venue: "College bar",
    isMandatory: false,
    deliveryMode: "in_person",
    description: null,
    requiredEquipment: null,
    joiningUrl: null,
  });
  amendEventId = approved.id;
  await saveEventAudience(
    actorPersonId,
    amendEventId,
    candidates
      .filter((candidate) => candidate.capacity === "player")
      .slice(0, 2)
      .map((candidate) => candidate.key),
  );
  await approveEvent(actorPersonId, amendEventId);
});

afterAll(async () => {
  const scope = `${MARKER}%`;
  const events = "(select id from public.events where name like $1)";
  const invitations = `(select id from public.invitations where event_id in ${events})`;
  await observer.query(
    `delete from public.nonresponse_flags where invitation_id in ${invitations}`,
    [scope],
  );
  await observer.query(
    `delete from public.delivery_attempts where notification_job_id in
       (select id from public.notification_jobs where event_id in ${events})`,
    [scope],
  );
  for (const table of ["event_messaging_plans", "notification_jobs"]) {
    await observer.query(`delete from public.${table} where event_id in ${events}`, [scope]);
  }
  await observer.query(
    `delete from public.rsvp_access_tokens where invitation_id in ${invitations}`,
    [scope],
  );
  for (const table of [
    "invitations",
    "event_audience_members",
    "event_audience_exclusions",
    "event_audience_groups",
    "event_questions",
    "schedule_changes",
  ]) {
    await observer.query(`delete from public.${table} where event_id in ${events}`, [scope]);
  }
  await observer.query(
    `delete from public.audit_events where entity_table = 'events' and entity_id in ${events}`,
    [scope],
  );
  await observer.query("delete from public.events where name like $1", [scope]);
  await observer.end();
  await closePool();
});

describe("the audience builder as the Social Secretary — no member detail leaves the server", () => {
  it("the fixture is meaningful: the catalogue holds contacts, statuses and units", () => {
    expect(contactValues.length).toBeGreaterThan(5);
    expect(candidates.some((candidate) => candidate.standing === "Active")).toBe(true);
    expect(candidates.some((candidate) => candidate.unit !== null)).toBe(true);
  });

  it("hands the builder names but no phone, email, status or unit", async () => {
    signInAs(SOCIAL_SECRETARY);
    const element = await renderStep("audience");
    const payload = propsOf(element);
    const html = renderToStaticMarkup(element);

    for (const value of contactValues) {
      expect(payload, value).not.toContain(value);
      expect(html, value).not.toContain(value);
    }
    expect(payload).not.toContain('"standing":"Active"');
    expect(payload).not.toMatch(/"unit":"(Both|Offence|Defence|Special teams)"/);
    expect(payload).not.toMatch(/"recruitStatus":"/);
    expect(html).not.toMatch(/· (Active|Onboarding|Both|Offence|Defence) ·/);

    const named = candidates.find((candidate) => candidate.capacity === "player");
    expect(named).toBeDefined();
    expect(html).toContain(named!.displayName);
  });

  it("hands the approval review no membership status", async () => {
    signInAs(SOCIAL_SECRETARY);
    const element = await renderStep("review");
    const payload = propsOf(element);
    expect(payload).not.toContain('"standing":"Active"');
    for (const value of contactValues) expect(payload, value).not.toContain(value);
  });

  it("keeps the group structure: every group presses to the same people", () => {
    const redacted = redactAudienceCandidates(candidates, SOCIAL_SECRETARY, "social");
    for (const option of audienceOptionsForEventType("social")) {
      expect(groupSelectionKeys(redacted, option.token).sort(), option.token).toEqual(
        groupSelectionKeys(candidates, option.token).sort(),
      );
    }
  });

  it("keeps every detail for a seat holding the roster and recruiting lines", () => {
    const full = seededGrantsFor(["president"]);
    const redacted = redactAudienceCandidates(candidates, full, "social");
    expect(redacted.map((candidate) => candidate.contact)).toEqual(
      candidates.map((candidate) => candidate.contact),
    );
    expect(redacted.map((candidate) => candidate.standing)).toEqual(
      candidates.map((candidate) => candidate.standing),
    );
  });
});

describe("the other pages carrying the catalogue, as the Social Secretary — G3", () => {
  it("hands the amend page's Add people list names but no member detail", async () => {
    const addable = await readAddableAudience(amendEventId);
    expect(addable.candidates.length).toBeGreaterThan(5);
    signInAs(SOCIAL_SECRETARY);
    const element = (await AmendEventPage({
      params: Promise.resolve({ id: amendEventId }),
    } as unknown as Parameters<typeof AmendEventPage>[0])) as Element;
    expect(propsOf(element)).toContain(addable.candidates[0].displayName);
    expectNoMemberDetail(element, contactsOf(addable.candidates));
  });

  it("hands the Social template's editor counts but no member detail", async () => {
    const catalogue = await readTemplateAudienceCatalogue("social");
    signInAs(SOCIAL_SECRETARY, TEMPLATE_ROLE_CODES);
    const element = (await EventTemplatePage({
      params: Promise.resolve({ templateId: SOCIAL_TEMPLATE_ID }),
    } as unknown as Parameters<typeof EventTemplatePage>[0])) as Element;
    expect(propsOf(element)).toContain('"candidates":[{');
    expectNoMemberDetail(element, contactsOf(catalogue.candidates));
  });

  it("hands the New template editor counts but no member detail", async () => {
    const catalogue = await readTemplateAudienceCatalogue(DEFAULT_TEMPLATE_CLASS);
    signInAs(SOCIAL_SECRETARY, TEMPLATE_ROLE_CODES);
    const element = (await NewEventTemplatePage()) as Element;
    expect(propsOf(element)).toContain('"candidates":[{');
    expectNoMemberDetail(element, contactsOf(catalogue.candidates));
  });
});

describe("the review step's unreachable panel follows Contact & emergency — G4", () => {
  it("the fixture is meaningful: some of the audience has no usable number", () => {
    expect(unreachableNames.length).toBeGreaterThan(0);
  });

  it("gives the Social Secretary the count and no names", async () => {
    signInAs(SOCIAL_SECRETARY);
    const element = await renderStep("review");
    const payload = propsOf(element);
    const html = renderToStaticMarkup(element);
    expect(payload).toContain(`"unreachable":{"count":${unreachableNames.length},"named":[]}`);
    expect(payload).not.toContain(NO_USABLE_NUMBER_REASON);
    expect(html).toContain('data-testid="whatsapp-errors"');
    expect(html).not.toContain('data-testid="whatsapp-error-row"');
  });

  it("names them for a seat holding Contact & emergency at View", async () => {
    signInAs(SOCIAL_SECRETARY_WITH_CONTACT);
    const html = renderToStaticMarkup(await renderStep("review"));
    expect(html.split('data-testid="whatsapp-error-row"').length - 1).toBe(unreachableNames.length);
  });
});
