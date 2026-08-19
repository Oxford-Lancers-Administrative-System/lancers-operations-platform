// @vitest-environment node
/**
 * What a coaching assignment cannot reach — LAN-110.
 *
 * ## Why this is a cross-cutting file rather than an assertion per screen
 *
 * LAN-110's boundary is stated once and applies everywhere: "coaches cannot
 * edit the roster, membership, recruitment/onboarding state, roles, event
 * approval, delivery administration or leadership reports", and "the service
 * layer enforces every read and write. Hidden navigation or controls are not an
 * authorization boundary."
 *
 * A property of that shape fails by **omission** — the screen nobody thought to
 * check, the action added next term. Per-surface tests cannot catch an omission,
 * because the missing test is exactly the thing that is missing. So this file
 * enumerates from the repository rather than from a list somebody maintains:
 *
 *   1. every real privileged server action in `/operate`, called directly with
 *      a coach actor, with the service layer live enough to notice if the guard
 *      let anything through;
 *   2. every `gateShellPage` call site in `src/app/`, checked against the two
 *      surfaces § 3 permits a coach to open.
 *
 * The second is a source scan, in the shape `tests/capability-map-single-source.test.ts`
 * established, and for the same reason: "no new page quietly opens to a coach"
 * is not observable from any single call.
 *
 * Direct calls, throughout. A server action is a POST endpoint that anybody
 * holding a session can reach whether or not a screen ever offered it, which is
 * the case LAN-110's own criterion names — "direct service-action tests prove
 * denial independently of the UI".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));

// Every service the actions below reach past their guard. All of them are
// mocked to **throw**, so a guard that let a coach through fails loudly here
// rather than quietly returning a form state that looks like a validation
// problem.
const REACHED_THE_SERVICE = new Error("the guard admitted a coach and the service was reached");

vi.mock("@/lib/services/membership", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/membership")>();
  return {
    ...actual,
    activateMembership: vi.fn(() => {
      throw REACHED_THE_SERVICE;
    }),
    setMembershipInactive: vi.fn(() => {
      throw REACHED_THE_SERVICE;
    }),
    reactivateMembership: vi.fn(() => {
      throw REACHED_THE_SERVICE;
    }),
    resolveOnboardingItem: vi.fn(() => {
      throw REACHED_THE_SERVICE;
    }),
  };
});
vi.mock("@/lib/services/roster", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/roster")>();
  return {
    ...actual,
    findDuplicateCandidates: vi.fn(() => {
      throw REACHED_THE_SERVICE;
    }),
    enterReturningPlayer: vi.fn(() => {
      throw REACHED_THE_SERVICE;
    }),
  };
});
vi.mock("@/lib/services/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/events")>();
  return {
    ...actual,
    createEventDraft: vi.fn(() => {
      throw REACHED_THE_SERVICE;
    }),
    updateEventDraft: vi.fn(() => {
      throw REACHED_THE_SERVICE;
    }),
    abandonEventDraft: vi.fn(() => {
      throw REACHED_THE_SERVICE;
    }),
    markEventOccurred: vi.fn(() => {
      throw REACHED_THE_SERVICE;
    }),
    markEventNotHeld: vi.fn(() => {
      throw REACHED_THE_SERVICE;
    }),
    correctOccurrenceAssertion: vi.fn(() => {
      throw REACHED_THE_SERVICE;
    }),
  };
});
vi.mock("@/lib/services/event-approval", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/event-approval")>();
  return {
    ...actual,
    approveEvent: vi.fn(() => {
      throw REACHED_THE_SERVICE;
    }),
    saveEventAudience: vi.fn(() => {
      throw REACHED_THE_SERVICE;
    }),
  };
});
vi.mock("@/lib/services/delivery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/delivery")>();
  return {
    ...actual,
    retryDelivery: vi.fn(() => {
      throw REACHED_THE_SERVICE;
    }),
    revokeAndReissue: vi.fn(() => {
      throw REACHED_THE_SERVICE;
    }),
  };
});
vi.mock("@/lib/services/attendance", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/attendance")>();
  return {
    ...actual,
    removeAttendance: vi.fn(() => {
      throw REACHED_THE_SERVICE;
    }),
  };
});

import { isServiceError, type ServiceError } from "@/lib/db";
import {
  resolveOperatorAccess,
  type OperatorAccess,
  type ResolvedOperator,
} from "@/lib/auth/operator";
import { FIXED_COACHING_ROLE_CODES } from "@/lib/auth/capabilities";
import {
  activateMembershipAction,
  reactivateMembershipAction,
  resolveOnboardingItemAction,
  setMembershipInactiveAction,
} from "@/app/operate/roster/actions";
import { submitReturnerIntake } from "@/app/operate/roster/new/actions";
import {
  abandonEventDraftAction,
  approveEventAction,
  assertEventOutcomeAction,
  correctEventOutcomeAction,
  createEventDraftAction,
  saveEventAudienceAction,
  updateEventDraftAction,
} from "@/app/operate/events/actions";
import {
  retryDeliveryAction,
  revokeAndReissueAction,
} from "@/app/operate/events/[id]/delivery/actions";
import { removeAttendanceAction } from "@/app/operate/events/[id]/attendance/actions";

const root = resolve(import.meta.dirname, "..");

function actor(roleCodes: string[]): ResolvedOperator {
  return {
    authUserId: "11111111-1111-4111-8111-111111111111",
    personId: "22222222-2222-4222-8222-222222222222",
    displayName: "Casey North",
    roleCodes,
    isActive: true,
  };
}

function givenCaller(access: OperatorAccess) {
  vi.mocked(resolveOperatorAccess).mockResolvedValue(access);
}

/** A form carrying every field any of these actions reads. */
function form(): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    membershipId: "55555555-5555-4555-8555-555555555555",
    itemId: "66666666-6666-4666-8666-666666666666",
    status: "complete",
    reason: "synthetic",
    overrideReason: "synthetic",
    eventId: "33333333-3333-4333-8333-333333333333",
    jobId: "77777777-7777-4777-8777-777777777777",
    invitationId: "88888888-8888-4888-8888-888888888888",
    participantKey: "player:55555555-5555-4555-8555-555555555555",
    outcome: "occurred",
    name: "Synthetic Practice",
    eventType: "practice",
    scheduledOn: "2026-10-14",
    startsAt: "20:00",
    intent: "submit",
    givenName: "Synthetic",
    familyName: "Person",
    email: "synthetic@example.invalid",
  })) {
    data.set(key, value);
  }
  return data;
}

/**
 * The refusal an action produced, or a failure naming what it did instead.
 *
 * An action that returns normally is the failure this file exists to catch: it
 * means the coach was admitted and the action decided to report something else.
 */
async function refusalFrom(call: () => Promise<unknown>): Promise<ServiceError> {
  let returned: unknown;
  try {
    returned = await call();
  } catch (error) {
    if (isServiceError(error)) return error;
    throw error;
  }
  throw new Error(
    `the action returned ${JSON.stringify(returned)} instead of refusing a coaching assignment`,
  );
}

/** Every privileged action a coach must not reach, by the name it is refused under. */
const FORBIDDEN: ReadonlyArray<{ name: string; call: () => Promise<unknown> }> = [
  { name: "activateMembershipAction", call: () => activateMembershipAction(null as never, form()) },
  {
    name: "setMembershipInactiveAction",
    call: () => setMembershipInactiveAction(null as never, form()),
  },
  {
    name: "reactivateMembershipAction",
    call: () => reactivateMembershipAction(null as never, form()),
  },
  {
    name: "resolveOnboardingItemAction",
    call: () => resolveOnboardingItemAction(null as never, form()),
  },
  { name: "submitReturnerIntake", call: () => submitReturnerIntake(null as never, form()) },
  { name: "createEventDraftAction", call: () => createEventDraftAction(null as never, form()) },
  { name: "updateEventDraftAction", call: () => updateEventDraftAction(null as never, form()) },
  { name: "abandonEventDraftAction", call: () => abandonEventDraftAction(null as never, form()) },
  { name: "approveEventAction", call: () => approveEventAction(null as never, form()) },
  { name: "saveEventAudienceAction", call: () => saveEventAudienceAction(null as never, form()) },
  { name: "assertEventOutcomeAction", call: () => assertEventOutcomeAction(null as never, form()) },
  {
    name: "correctEventOutcomeAction",
    call: () => correctEventOutcomeAction(null as never, form()),
  },
  { name: "retryDeliveryAction", call: () => retryDeliveryAction(null as never, form()) },
  { name: "revokeAndReissueAction", call: () => revokeAndReissueAction(null as never, form()) },
  { name: "removeAttendanceAction", call: () => removeAttendanceAction(null as never, form()) },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LAN-110 — a coaching assignment is refused every action that is not recording", () => {
  // Every fixed coaching seat, not the three the audience catalogue calls
  // coaches. LAN-129 put all ten on the narrow attendance grant
  // (`REQ-coach-operator-onboarding`), so all ten are inside this boundary and
  // the seven added there would otherwise be checked by nothing at all — the
  // failure by omission this file exists to prevent.
  for (const code of FIXED_COACHING_ROLE_CODES) {
    it.each(FORBIDDEN)(`refuses a ${code} at $name`, async ({ call }) => {
      givenCaller({ state: "active", operator: actor([code]) });

      const refusal = await refusalFrom(call);

      expect(refusal.kind).toBe("not_permitted");
    });
  }

  it("refuses a coach holding all ten seats, not merely one", async () => {
    for (const { name, call } of FORBIDDEN) {
      givenCaller({ state: "active", operator: actor([...FIXED_COACHING_ROLE_CODES]) });

      const refusal = await refusalFrom(call);

      expect(refusal.kind, name).toBe("not_permitted");
    }
  });

  it("names no seat the coach holds, in any of the refusals", async () => {
    // The rule `guards.ts` keeps everywhere: a refusal describes what the
    // action needs and says nothing about the reader.
    givenCaller({ state: "active", operator: actor(["head_coach"]) });

    for (const { name, call } of FORBIDDEN) {
      const refusal = await refusalFrom(call);

      expect(refusal.message, name).not.toMatch(/head coach|head_coach|Casey North/i);
    }
  });

  it("still admits the operators who held these actions before", async () => {
    // The narrowing must reach the coach and nobody else. A Secretary who also
    // coaches is not narrowed, so every one of these gets past the guard and
    // into the service — which is mocked to throw a plain `Error`, and a plain
    // `Error` is exactly how "the guard passed" shows up here.
    givenCaller({ state: "active", operator: actor(["secretary", "head_coach"]) });

    const reached: string[] = [];
    for (const { name, call } of FORBIDDEN) {
      try {
        await call();
      } catch (error) {
        if (error === REACHED_THE_SERVICE) reached.push(name);
        else if (isServiceError(error) && error.kind === "not_permitted") continue;
      }
    }

    // Not every action on the list is open to a Secretary — delivery and the
    // occurrence assertion are, membership activation is, the report is not —
    // so this asserts that the narrowing did not close the ones that were open.
    expect(reached).toContain("activateMembershipAction");
    expect(reached).toContain("resolveOnboardingItemAction");
    expect(reached).toContain("assertEventOutcomeAction");
    expect(reached).toContain("retryDeliveryAction");
  });
});

// ---------------------------------------------------------------------------
// The source scan: which surfaces open to a coach at all
// ---------------------------------------------------------------------------

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!/\.tsx?$/.test(full)) return [];
    if (/\.test\.tsx?$/.test(full)) return [];
    return [full];
  });
}

describe("LAN-110 — only the approved surfaces open to a coaching assignment", () => {
  const files = sourceFiles(join(root, "src", "app")).map((file) =>
    relative(root, file).split("\\").join("/"),
  );

  /**
   * The three routes § 3 and the coach shell need, and no others.
   *
   * `/operate` renders nothing and forwards; `/operate/events` is the coach's
   * one destination; the attendance board is the surface itself. Anything else
   * appearing here is a screen somebody opened to a coach, and that is a UX and
   * authorization change rather than an implementation detail.
   */
  const APPROVED = [
    "src/app/operate/page.tsx",
    "src/app/operate/events/page.tsx",
    "src/app/operate/events/[id]/attendance/page.tsx",
  ];

  it("found the application source to scan", () => {
    // A scan that silently found nothing would pass every assertion below.
    expect(files.length).toBeGreaterThan(10);
    for (const approved of APPROVED) expect(files).toContain(approved);
  });

  it("opts exactly three routes in, and the gate refuses the rest by default", () => {
    const optedIn = files.filter((file) =>
      /narrowRecorder:\s*"allow"/.test(readFileSync(join(root, file), "utf8")),
    );

    expect([...optedIn].sort()).toEqual([...APPROVED].sort());
  });

  it("gives every other page under /operate the refusing default", () => {
    // Not "they pass refuse" — they say nothing, and the default is refuse.
    // Stated as a test because the default is the whole safety property: a page
    // added next term inherits it by doing nothing at all.
    const gated = files.filter(
      (file) =>
        file.startsWith("src/app/operate/") &&
        /gateShellPage\(/.test(readFileSync(join(root, file), "utf8")),
    );

    expect(gated.length).toBeGreaterThan(APPROVED.length);

    for (const file of gated) {
      // The gate itself declares the option, and is not a page.
      if (APPROVED.includes(file) || file === "src/app/operate/gate.tsx") continue;
      const source = readFileSync(join(root, file), "utf8");
      expect(source, file).not.toMatch(/narrowRecorder/);
    }
  });
});
