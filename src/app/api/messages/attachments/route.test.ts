// @vitest-environment node
/**
 * The Messages attachment upload routes — LAN-514.
 *
 * Against the real database: the question is whether a row is written,
 * changed or removed. Only the session is stubbed (`resolveOperatorAccess`),
 * so the real `requireCapability("delivery_administration")` decides from the
 * operator's seats, and the real service decides whose upload it is.
 *
 * Every request is refused before anything is read unless it carries this
 * application's own Origin; a session without `delivery_administration` is
 * refused with a 403 status, never a redirect; and one operator can neither
 * add to nor remove another operator's upload.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { resolveOperatorAccess } = vi.hoisted(() => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess }));

import type { Client } from "pg";

import type { ResolvedOperator } from "@/lib/auth/operator";
import { closePool } from "@/lib/db";
import { openObserver } from "../../../../../tests/helpers/service-layer";
import { DELETE, PUT } from "./[id]/route";
import { POST } from "./route";

const MARKER = "LAN514UploadRoute";
const HOST = "lancers.example.test";
const ORIGIN = `https://${HOST}`;

let observer: Client;
let ownerPersonId: string;
let otherPersonId: string;

function operator(personId: string, roleCodes: string[]): ResolvedOperator {
  return {
    authUserId: `auth-${personId}`,
    personId,
    displayName: MARKER,
    roleCodes,
    grants: {} as ResolvedOperator["grants"],
    isActive: true,
  };
}

function signedInAs(personId: string, roleCodes: string[] = ["secretary"]) {
  resolveOperatorAccess.mockResolvedValue({
    state: "active",
    operator: operator(personId, roleCodes),
  });
}

function headers(origin: string | null): Headers {
  const result = new Headers({ host: HOST });
  if (origin !== null) result.set("origin", origin);
  return result;
}

function start(origin: string | null = ORIGIN, byteSize = 10) {
  const requestHeaders = headers(origin);
  requestHeaders.set("content-type", "application/json");
  return POST(
    new Request(`${ORIGIN}/api/messages/attachments`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        filename: `${MARKER}-playbook.pdf`,
        contentType: "application/pdf",
        byteSize,
      }),
    }),
  );
}

function append(id: string, offset: number, bytes: Uint8Array, origin: string | null = ORIGIN) {
  return PUT(
    new Request(`${ORIGIN}/api/messages/attachments/${id}?offset=${offset}`, {
      method: "PUT",
      headers: headers(origin),
      body: Buffer.from(bytes),
    }),
    { params: Promise.resolve({ id }) },
  );
}

function remove(id: string, origin: string | null = ORIGIN) {
  return DELETE(
    new Request(`${ORIGIN}/api/messages/attachments/${id}`, {
      method: "DELETE",
      headers: headers(origin),
    }),
    { params: Promise.resolve({ id }) },
  );
}

async function uploads() {
  const result = await observer.query<{
    id: string;
    uploaded_by_person_id: string;
    held: number;
  }>(
    `select id, uploaded_by_person_id, octet_length(content) as held
       from public.club_message_attachments where filename like $1 order by created_at`,
    [`${MARKER}%`],
  );
  return result.rows;
}

/** An upload the owner started through the route, as the compose form does. */
async function ownersUpload(): Promise<string> {
  signedInAs(ownerPersonId);
  const response = await start();
  expect(response.status).toBe(200);
  const body = (await response.json()) as { id: string };
  return body.id;
}

beforeAll(async () => {
  observer = await openObserver();
  const people = await observer.query<{ id: string }>(
    `insert into public.people (given_name, family_name)
     values ($1, 'Owner'), ($1, 'Other') returning id`,
    [MARKER],
  );
  [ownerPersonId, otherPersonId] = people.rows.map((row) => row.id);
});

beforeEach(() => {
  resolveOperatorAccess.mockReset();
});

afterEach(async () => {
  await observer.query("delete from public.club_message_attachments where filename like $1", [
    `${MARKER}%`,
  ]);
});

afterAll(async () => {
  await observer.query("delete from public.people where given_name = $1", [MARKER]);
  await observer.end();
  await closePool();
});

describe("a request from anywhere but this application's own pages", () => {
  it("is refused with no Origin, before the session is read", async () => {
    signedInAs(ownerPersonId);
    const response = await start(null);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ status: "forbidden" });
    expect(resolveOperatorAccess).not.toHaveBeenCalled();
    expect(await uploads()).toEqual([]);
  });

  it("is refused with another site's Origin", async () => {
    signedInAs(ownerPersonId);
    const response = await start("https://elsewhere.example.test");
    expect(response.status).toBe(403);
    expect(resolveOperatorAccess).not.toHaveBeenCalled();
    expect(await uploads()).toEqual([]);
  });

  it("is refused for a chunk and a removal too", async () => {
    const id = await ownersUpload();
    resolveOperatorAccess.mockClear();

    expect((await append(id, 0, new Uint8Array(5), null)).status).toBe(403);
    expect((await append(id, 0, new Uint8Array(5), "https://elsewhere.example.test")).status).toBe(
      403,
    );
    expect((await remove(id, null)).status).toBe(403);
    expect((await remove(id, "https://elsewhere.example.test")).status).toBe(403);
    expect(resolveOperatorAccess).not.toHaveBeenCalled();
    expect(await uploads()).toEqual([{ id, uploaded_by_person_id: ownerPersonId, held: 0 }]);
  });
});

describe("who may upload", () => {
  it("is a seat that administers delivery: a coach is refused with a status, not a redirect", async () => {
    signedInAs(ownerPersonId, ["head_coach"]);
    const response = await start();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ status: "forbidden" });
    expect(await uploads()).toEqual([]);
  });

  it("refuses a coach's chunk and removal of an upload", async () => {
    const id = await ownersUpload();
    signedInAs(ownerPersonId, ["head_coach"]);
    expect((await append(id, 0, new Uint8Array(5))).status).toBe(403);
    expect((await remove(id)).status).toBe(403);
    expect(await uploads()).toEqual([{ id, uploaded_by_person_id: ownerPersonId, held: 0 }]);
  });

  it("lets the Secretary start, fill and remove an upload of their own", async () => {
    const id = await ownersUpload();
    expect(await uploads()).toEqual([{ id, uploaded_by_person_id: ownerPersonId, held: 0 }]);

    const first = await append(id, 0, new Uint8Array(5));
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ status: "ok", received: 5, complete: false });

    expect((await remove(id)).status).toBe(200);
    expect(await uploads()).toEqual([]);
  });
});

describe("another operator's upload", () => {
  it("cannot be added to", async () => {
    const id = await ownersUpload();
    signedInAs(otherPersonId);
    const response = await append(id, 0, new Uint8Array(5));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ status: "refused" });
    expect(await uploads()).toEqual([{ id, uploaded_by_person_id: ownerPersonId, held: 0 }]);
  });

  it("cannot be removed", async () => {
    const id = await ownersUpload();
    signedInAs(otherPersonId);
    const response = await remove(id);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ status: "refused" });
    expect(await uploads()).toEqual([{ id, uploaded_by_person_id: ownerPersonId, held: 0 }]);
  });
});
