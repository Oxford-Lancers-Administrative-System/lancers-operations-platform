/**
 * `readEvent` is its own boundary — LAN-423 fix round 1, F4.
 *
 * The pages gate through `gateEventPage` first, but the service must refuse on
 * its own: a seat without View on the event's template is `NotPermitted`, and
 * the event is never read.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("./template-of", () => ({
  eventTemplateIdOf: vi.fn(),
  invitationTemplateIdsOf: vi.fn(),
  notificationJobTemplateOf: vi.fn(),
}));
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, withTransaction: vi.fn() };
});

import { withTransaction } from "@/lib/db";
import { resolveOperatorAccess } from "@/lib/auth/operator";
import { mergeGrantRows, type OperatorGrants } from "@/lib/auth/grants";
import { eventTemplateIdOf } from "./template-of";
import { readEvent } from "./read";

const EVENT_ID = "11111111-2222-4333-8444-555555555555";
const SOCIAL = "8de00424-52a8-52ad-9c9f-a29823f9c4bf";
const PRACTICE = "7e34a764-7ed1-535e-8cef-73e00a62eafc";

function signInAs(grants: OperatorGrants): void {
  vi.mocked(resolveOperatorAccess).mockResolvedValue({
    state: "active",
    operator: {
      authUserId: "00000000-4230-4423-8423-000000000425",
      personId: "00000000-4230-4423-8423-000000000426",
      displayName: "Boundary Operator",
      roleCodes: [],
      grants,
      isActive: true,
    },
  });
}

beforeEach(() => {
  vi.mocked(withTransaction).mockReset();
  vi.mocked(eventTemplateIdOf).mockResolvedValue(PRACTICE);
});

describe("readEvent refuses a seat without View on the event's template", () => {
  it("refuses a seat holding no template at all, and reads nothing", async () => {
    signInAs(mergeGrantRows([]));
    await expect(readEvent(EVENT_ID)).rejects.toMatchObject({ kind: "not_permitted" });
    expect(withTransaction).not.toHaveBeenCalled();
  });

  it("refuses a seat holding another template only, and reads nothing", async () => {
    signInAs(
      mergeGrantRows([
        { subject_kind: "event_template", subject_key: null, template_id: SOCIAL, level: "manage" },
      ]),
    );
    await expect(readEvent(EVENT_ID)).rejects.toMatchObject({ kind: "not_permitted" });
    expect(withTransaction).not.toHaveBeenCalled();
  });

  it("reads for a seat holding View on the event's template", async () => {
    signInAs(
      mergeGrantRows([
        { subject_kind: "event_template", subject_key: null, template_id: PRACTICE, level: "view" },
      ]),
    );
    vi.mocked(withTransaction).mockResolvedValue({ id: EVENT_ID } as never);
    await expect(readEvent(EVENT_ID)).resolves.toEqual({ id: EVENT_ID });
    expect(withTransaction).toHaveBeenCalledTimes(1);
  });
});

describe("readEventUnchecked stays off the pages", () => {
  it("is imported by nothing under src/app", () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (
          /\.tsx?$/.test(name) &&
          readFileSync(path, "utf8").includes("readEventUnchecked")
        ) {
          offenders.push(path);
        }
      }
    };
    walk(join(process.cwd(), "src", "app"));
    expect(offenders).toEqual([]);
  });
});
