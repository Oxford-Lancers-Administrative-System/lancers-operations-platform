// @vitest-environment node
/**
 * The prospect record's What changed — LAN-423 fix round 1, F1.
 *
 * `readPersonHistory`'s audit rows for `contact_points` carry the raw value in
 * `from_state`/`to_state`. The recruit record reads that history for anyone
 * holding Recruit details, so without a filter a seat with Recruit details at
 * View and Person information at None received the recruit's old and new
 * mobile. This suite renders the real page (`/operate/recruitment/[prospectId]`)
 * against the local database after superseding a contact point, and asserts
 * the values are absent from the props and the HTML for that seat, and present
 * for a seat holding Person information.
 *
 * The suite mints its own person and prospect, tagged with a marker unique to
 * this file, and deletes every row it wrote. Every value is invented for it.
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
import { supersedeContactPoint } from "@/lib/services/person-write/contact";
import RecruitmentRecordPage from "@/app/operate/recruitment/[prospectId]/page";
import { openObserver, seededActorPersonId } from "./helpers/service-layer";

const MARKER = "LAN423ProspectPayload";
const OLD_MOBILE = "+447700900555";
const NEW_MOBILE = "+447700900556";

let observer: Client;
let actorPersonId: string;
let personId: string;
let prospectId: string;

function recruiting(levels: Record<string, string>): OperatorGrants {
  const rows: GrantRow[] = Object.entries(levels).map(([key, level]) => ({
    subject_kind: "recruiting_category",
    subject_key: key,
    template_id: null,
    level,
  }));
  return mergeGrantRows(rows);
}

function signInAs(grants: OperatorGrants): void {
  vi.mocked(resolveOperatorAccess).mockResolvedValue({
    state: "active",
    operator: {
      authUserId: "00000000-4230-4423-8423-000000000423",
      personId: actorPersonId,
      displayName: "Payload Operator",
      roleCodes: [],
      grants,
      isActive: true,
    },
  });
}

async function renderPage(): Promise<ReactElement<Record<string, unknown>>> {
  return (await RecruitmentRecordPage({
    params: Promise.resolve({ prospectId }),
  } as unknown as Parameters<typeof RecruitmentRecordPage>[0])) as ReactElement<
    Record<string, unknown>
  >;
}

beforeAll(async () => {
  observer = await openObserver();
  actorPersonId = await seededActorPersonId(observer);
  const season = await withTransaction((tx) => resolveOpenSeason(tx));
  const person = await observer.query<{ id: string }>(
    `insert into public.people (given_name, family_name) values ($1, 'Quillfeather') returning id`,
    [MARKER],
  );
  personId = person.rows[0].id;
  const prospect = await observer.query<{ id: string }>(
    `insert into public.recruitment_prospects (person_id, season_id, status, source)
     values ($1::uuid, $2::uuid, 'identified', 'other') returning id`,
    [personId, season.id],
  );
  prospectId = prospect.rows[0].id;
  await supersedeContactPoint({ actorPersonId, personId, kind: "phone", rawValue: OLD_MOBILE });
  await supersedeContactPoint({
    actorPersonId,
    personId,
    kind: "phone",
    rawValue: NEW_MOBILE,
    reason: "test fixture correction",
  });
});

afterAll(async () => {
  if (personId) {
    await observer.query(
      `delete from public.audit_events
        where (entity_table = 'contact_points' and context ->> 'person_id' = $1::text)
           or entity_id = $1::uuid`,
      [personId],
    );
    await observer.query(`delete from public.recruitment_prospects where person_id = $1::uuid`, [
      personId,
    ]);
    await observer.query(`delete from public.contact_points where person_id = $1::uuid`, [
      personId,
    ]);
    await observer.query(`delete from public.people where id = $1::uuid`, [personId]);
  }
  await observer.end();
  await closePool();
});

const CONTACT_STRINGS = [OLD_MOBILE, NEW_MOBILE, "7700900555", "7700900556"];

describe("the prospect record's What changed — contact values follow Person information", () => {
  it("hands a Recruit-details-only seat no contact value in the props or the HTML", async () => {
    signInAs(recruiting({ recruit_details: "view" }));
    const element = await renderPage();
    const payload = JSON.stringify(element.props);
    for (const value of CONTACT_STRINGS) expect(payload, value).not.toContain(value);
    expect(payload).not.toContain('"contactFact":true');
    const html = renderToStaticMarkup(element);
    for (const value of CONTACT_STRINGS) expect(html, value).not.toContain(value);
  });

  it("keeps the contact change for a seat holding Person information", async () => {
    signInAs(recruiting({ recruit_person: "view", recruit_details: "view" }));
    const payload = JSON.stringify((await renderPage()).props);
    expect(payload).toContain(NEW_MOBILE);
    expect(payload).toContain('"contactFact":true');
  });
});
