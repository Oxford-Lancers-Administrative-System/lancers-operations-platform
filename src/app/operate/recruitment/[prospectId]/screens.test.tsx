/**
 * `/operate/recruitment/[prospectId]` — the recruit record's own page-level
 * gate.
 *
 * Walk correction: `REQ-core-four` is a security requirement, and the
 * mission's final walk could not verify coach-role exclusion here (browser
 * extension interference blocked the seeded `+coach` login, judged low risk
 * because the gate is pre-existing and shipped). This proves it directly
 * against the real page: a coaching-only identity is refused before
 * `readRecruitmentProspect()` or `readPersonRecord()` is ever read, and the
 * four offices are admitted — on the same real-page-render model
 * `../../roster/[membershipId]/screens.test.tsx` already uses for
 * `REQ-authority`. Ordinary record behaviour is already proved in
 * `record-view.test.tsx`; this file exists for the gate alone.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("@/lib/services/recruitment-prospect", () => ({ readRecruitmentProspect: vi.fn() }));
vi.mock("@/lib/services/person-record", () => ({ readPersonRecord: vi.fn() }));
vi.mock("@/lib/auth/person-authority", () => ({
  redactPersonRecord: vi.fn((record: Record<string, unknown>) => record),
}));
// Both send buttons and the notes card call into this record's own actions —
// mocked so rendering the admitted-role case never reaches a service. The
// writes themselves are proved for real in `recruitment-prospect.test.ts`,
// and the actions' own coach exclusion is proved directly in `actions.test.ts`.
vi.mock("./actions", () => ({
  addRecruitmentNoteAction: vi.fn().mockResolvedValue({ error: null }),
  sendRecruitmentQuestionnaireAction: vi
    .fn()
    .mockResolvedValue({ error: null, created: [], reason: "not_consented" }),
}));
// `record-view.tsx`'s own StatusCell reaches `../board-actions`, one
// directory up from here.
vi.mock("../board-actions", () => ({
  setRecruitmentStatusAction: vi.fn().mockResolvedValue({ error: null }),
  flipRecruitmentProspectAction: vi.fn().mockResolvedValue({ error: null }),
}));

import { resolveOperatorAccess, type OperatorAccess } from "@/lib/auth/operator";
import { readRecruitmentProspect } from "@/lib/services/recruitment-prospect";
import type { RecruitmentProspectRecord } from "@/lib/services/recruitment-prospect";
import { readPersonRecord } from "@/lib/services/person-record";
import RecruitmentRecordPage from "./page";

const PROSPECT_ID = "44444444-4444-4444-8444-444444444444";
const PERSON_ID = "55555555-5555-4555-8555-555555555555";

function operatorAccess(roleCodes: string[]): OperatorAccess {
  return {
    state: "active",
    operator: {
      authUserId: "11111111-1111-4111-8111-111111111111",
      personId: "22222222-2222-4222-8222-222222222222",
      displayName: "Rowan Ashdown",
      roleCodes,
      isActive: true,
    },
  };
}

function signedInAs(roleCodes: string[]): void {
  vi.mocked(resolveOperatorAccess).mockResolvedValue(operatorAccess(roleCodes));
}

function pageProps() {
  return {
    params: Promise.resolve({ prospectId: PROSPECT_ID }),
  } as unknown as Parameters<typeof RecruitmentRecordPage>[0];
}

function givenRecord(overrides: Partial<RecruitmentProspectRecord> = {}): void {
  vi.mocked(readRecruitmentProspect).mockResolvedValue({
    prospectId: PROSPECT_ID,
    personId: PERSON_ID,
    seasonId: "season-1",
    seasonLabel: "2026-27",
    displayName: "Ambrose Kittiwake",
    status: "engaged",
    source: "Freshers' fair",
    firstContactOn: "2026-05-01",
    committedOn: null,
    convertedMembershipId: null,
    consent: "never_asked",
    consentSource: null,
    personal: { lastSentAt: null, queuedFor: null },
    recruitment: { lastSentAt: null, queuedFor: null },
    answers: {
      playedBefore: null,
      watchedBefore: null,
      positionInterest: null,
      gearOwned: null,
      howTheyHeard: null,
      anythingElse: null,
    },
    events: [],
    notes: [],
    statusHistory: [],
    ...overrides,
  });
  vi.mocked(readPersonRecord).mockResolvedValue({} as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("REQ-authority / REQ-core-four — coach-role exclusion, the walk's own gap", () => {
  for (const role of ["head_coach", "offence_coach", "defence_coach"]) {
    it(`refuses a ${role}-only operator before the record is ever read`, async () => {
      signedInAs([role]);
      givenRecord();

      const { container } = render(await RecruitmentRecordPage(pageProps()));

      expect(screen.getByTestId("operator-not-permitted")).toBeInTheDocument();
      expect(readRecruitmentProspect).not.toHaveBeenCalled();
      expect(readPersonRecord).not.toHaveBeenCalled();
      expect(container.innerHTML).not.toContain("Ambrose Kittiwake");
    });
  }

  for (const role of ["president", "vice_president", "secretary", "general_manager"]) {
    it(`admits the ${role} seat`, async () => {
      signedInAs([role]);
      givenRecord();

      render(await RecruitmentRecordPage(pageProps()));

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ambrose Kittiwake");
      expect(readRecruitmentProspect).toHaveBeenCalledWith(PROSPECT_ID);
    });
  }
});
