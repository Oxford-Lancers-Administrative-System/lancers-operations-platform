/**
 * `/operate/people/[personId]/edit` — W2-01. LAN-185.
 *
 * The action-level suite (`actions.test.ts`) proves behaviour against the
 * real database; this proves the page-level refusal is total.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("@/lib/services/person-record", () => ({ readPersonRecord: vi.fn() }));
vi.mock("@/lib/services/person-write", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/person-write")>(
    "@/lib/services/person-write",
  );
  return { ...actual, personVersion: vi.fn() };
});

import { resolveOperatorAccess, type OperatorAccess } from "@/lib/auth/operator";
import { readPersonRecord } from "@/lib/services/person-record";
import { personVersion } from "@/lib/services/person-write";
import EditPersonPage from "./page";

function signedInAs(roleCodes: string[]): void {
  const access: OperatorAccess = {
    state: "active",
    operator: {
      authUserId: "00000000-1111-4111-8111-111111111111",
      personId: "11111111-1111-4111-8111-111111111111",
      displayName: "Morgan Pike",
      roleCodes,
      isActive: true,
    },
  };
  vi.mocked(resolveOperatorAccess).mockResolvedValue(access);
}

function pageProps() {
  return { params: Promise.resolve({ personId: "22222222-1111-4111-8111-111111111111" }) } as never;
}

describe("an operator outside the four offices", () => {
  it("is refused, and no person data reaches the DOM", async () => {
    signedInAs(["treasurer"]);
    const element = await EditPersonPage(pageProps());
    render(element);
    expect(screen.queryByText("Correct this record")).toBeNull();
    expect(screen.getByTestId("operator-not-permitted")).toBeTruthy();
    expect(readPersonRecord).not.toHaveBeenCalled();
  });
});

describe("a four-role operator", () => {
  it("reaches the edit surface, sectioned as the record reads", async () => {
    signedInAs(["secretary"]);
    vi.mocked(personVersion).mockResolvedValue(null);
    vi.mocked(readPersonRecord).mockResolvedValue({
      personId: "22222222-1111-4111-8111-111111111111",
      givenName: "Hollis",
      givenNameSource: null,
      familyName: "Jarrowdale",
      familyNameSource: null,
      aliases: [],
      displayName: "Hollis Jarrowdale",
      status: "active",
      college: null,
      collegeSource: null,
      matriculationYear: null,
      matriculationYearSource: null,
      expectedGraduationYear: null,
      expectedGraduationYearSource: null,
      degreeField: null,
      degreeFieldSource: null,
      dateOfBirth: null,
      dateOfBirthSource: null,
      emergencyContact: null,
      contacts: [],
      isPastMember: false,
      standingIsOverridden: false,
      isUnder18: null,
      halfBlueCount: 0,
      fullBlueCount: 0,
      mergedIntoPersonId: null,
      missingRequiredFields: [],
    });

    const element = await EditPersonPage(pageProps());
    const { container } = render(element);

    expect(screen.getByRole("heading", { name: "Correct this record" })).toBeTruthy();
    expect(screen.getByText("Who they are")).toBeTruthy();
    expect(screen.getByText("How to reach them")).toBeTruthy();
    expect(screen.getByText("Academic")).toBeTruthy();
    expect(screen.getByText("Restricted")).toBeTruthy();
    expect(container.querySelector('input[name="givenName"]')).toHaveValue("Hollis");
  });
});
