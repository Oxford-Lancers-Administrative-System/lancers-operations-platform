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
 * The suite creates its own Social draft, tagged with a marker unique to this
 * file, and deletes every row it wrote.
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
import { readApprovalPreview, saveEventAudience } from "@/lib/services/event-approval";
import {
  audienceOptionsForEventType,
  groupSelectionKeys,
  type AudienceCandidate,
} from "@/lib/services/audience-selection";
import { redactAudienceCandidates } from "@/lib/services/event-audience-access";
import EventDetailPage from "@/app/operate/events/[id]/page";
import { openObserver, seededActorPersonId } from "./helpers/service-layer";

const MARKER = "LAN423AudiencePayload";
const SOCIAL_TEMPLATE_ID = "8de00424-52a8-52ad-9c9f-a29823f9c4bf";

let observer: Client;
let actorPersonId: string;
let eventId: string;
let candidates: readonly AudienceCandidate[];
let contactValues: string[];

/** The Social Secretary: Manage on Social, None on everything else. */
const SOCIAL_SECRETARY: OperatorGrants = mergeGrantRows([
  {
    subject_kind: "event_template",
    subject_key: null,
    template_id: SOCIAL_TEMPLATE_ID,
    level: "manage",
  },
] satisfies GrantRow[]);

function signInAs(grants: OperatorGrants): void {
  vi.mocked(resolveOperatorAccess).mockResolvedValue({
    state: "active",
    operator: {
      authUserId: "00000000-4230-4423-8423-000000000424",
      personId: actorPersonId,
      displayName: "Payload Operator",
      roleCodes: [],
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
  contactValues = candidates
    .map((candidate) => candidate.contact)
    .filter((value): value is string => value !== null);
});

afterAll(async () => {
  if (eventId) {
    for (const table of ["event_audience_members", "event_audience_groups", "event_questions"]) {
      await observer.query(`delete from public.${table} where event_id = $1::uuid`, [eventId]);
    }
    await observer.query(
      `delete from public.audit_events where entity_table = 'events' and entity_id = $1::uuid`,
      [eventId],
    );
    await observer.query(`delete from public.events where id = $1::uuid`, [eventId]);
  }
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
