/**
 * `/operate/people/[personId]/edit` — W2-01. LAN-185.
 *
 * The action-level suite (`actions.test.ts`) proves behaviour against the
 * real database; this proves the page-level refusal is total.
 */
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

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
vi.mock("@/lib/services/seasons", () => ({ readCurrentSeason: vi.fn() }));
// LAN-389: the only test here that submits is the confirm-box pair below.
vi.mock("./actions", async () => {
  const actual = await vi.importActual<typeof import("./actions")>("./actions");
  return { ...actual, submitPersonEdit: vi.fn() };
});

import { resolveOperatorAccess, type OperatorAccess } from "@/lib/auth/operator";
import { readPersonRecord } from "@/lib/services/person-record";
import { personVersion } from "@/lib/services/person-write";
import { readCurrentSeason } from "@/lib/services/seasons";
import { submitPersonEdit } from "./actions";
import { INITIAL_EDIT_STATE } from "./edit-state";
import EditPersonPage from "./page";
import { seededGrantsFor } from "@/lib/auth/capabilities";

function signedInAs(roleCodes: string[]): void {
  const access: OperatorAccess = {
    state: "active",
    operator: {
      authUserId: "00000000-1111-4111-8111-111111111111",
      personId: "11111111-1111-4111-8111-111111111111",
      displayName: "Morgan Pike",
      roleCodes,
      grants: seededGrantsFor(roleCodes),
      isActive: true,
    },
  };
  vi.mocked(resolveOperatorAccess).mockResolvedValue(access);
}

function pageProps() {
  return { params: Promise.resolve({ personId: "22222222-1111-4111-8111-111111111111" }) } as never;
}

/** The record the phone tests below edit — two numbers already on file. */
function populatedRecord() {
  return {
    personId: "22222222-1111-4111-8111-111111111111",
    givenName: "Kenelm",
    givenNameSource: null,
    middleName: null,
    middleNameSource: null,
    familyName: "Netherby",
    familyNameSource: null,
    aliases: [],
    displayName: "Kenelm Netherby",
    status: "active",
    college: "Pyrford",
    collegeSource: null,
    matriculationYear: 2022,
    matriculationYearSource: null,
    expectedGraduationYear: 2026,
    expectedGraduationYearSource: null,
    degreeField: "Human Sciences",
    degreeFieldSource: null,
    studentNumber: null,
    studentNumberSource: null,
    bafaRegistrationNumber: null,
    bafaRegistrationNumberSource: null,
    dateOfBirth: "2003-08-08",
    dateOfBirthSource: null,
    emergencyContact: {
      givenName: "Barnaby",
      familyName: "Netherby",
      relationship: "Parent",
      phone: "+447700900136",
      email: null,
    },
    contacts: [
      {
        id: "c1",
        kind: "phone",
        scope: null,
        rawValue: "+44 7700 900412",
        normalisedValue: "+447700900412",
        isPreferred: true,
        source: null,
        validFrom: new Date("2020-01-01"),
        validUntil: null,
      },
    ],
    isPastMember: false,
    standingIsOverridden: false,
    isUnder18: null,
    halfBlueCount: 0,
    fullBlueCount: 0,
    mergedIntoPersonId: null,
    missingRequiredFields: [],
  } as never;
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
    vi.mocked(readCurrentSeason).mockResolvedValue({
      id: "33333333-1111-4111-8111-111111111111",
      label: "2026-27",
    } as never);
    vi.mocked(readPersonRecord).mockResolvedValue({
      personId: "22222222-1111-4111-8111-111111111111",
      givenName: "Hollis",
      givenNameSource: null,
      middleName: null,
      middleNameSource: null,
      familyName: "Jarrowdale",
      familyNameSource: null,
      aliases: [],
      displayName: "Hollis Jarrowdale",
      knownAs: null,
      status: "active",
      college: null,
      collegeSource: null,
      matriculationYear: null,
      matriculationYearSource: null,
      expectedGraduationYear: null,
      expectedGraduationYearSource: null,
      degreeField: null,
      degreeFieldSource: null,
      studentNumber: null,
      studentNumberSource: null,
      bafaRegistrationNumber: null,
      bafaRegistrationNumberSource: null,
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
    // LAN-365 correction: no separate "Academic" section any more — its four
    // fields folded into "Who they are".
    expect(screen.queryByText("Academic")).toBeNull();
    expect(screen.getByText("Restricted")).toBeTruthy();
    expect(container.querySelector('input[name="givenName"]')).toHaveValue("Hollis");
  });

  // B1, LAN-185 correction round 2 (Brian's walk): a populated record used to
  // render a "Reason for the change" box under every populated field before
  // the operator had touched anything. It must appear only once a field's
  // live value actually differs from what is stored, and disappear again if
  // the operator puts the original value back.
  it("shows the reason box only once a value actually changes, and hides it again when reverted", async () => {
    signedInAs(["secretary"]);
    vi.mocked(personVersion).mockResolvedValue(null);
    vi.mocked(readCurrentSeason).mockResolvedValue({
      id: "33333333-1111-4111-8111-111111111111",
      label: "2026-27",
    } as never);
    vi.mocked(readPersonRecord).mockResolvedValue(populatedRecord());

    const element = await EditPersonPage(pageProps());
    render(element);

    // A dozen filled fields, nothing touched yet — no reason box anywhere.
    expect(screen.queryAllByLabelText("Reason for the change")).toHaveLength(0);

    const college = screen.getByLabelText("College");
    fireEvent.change(college, { target: { value: "Balliol" } });
    expect(screen.queryAllByLabelText("Reason for the change")).toHaveLength(1);

    fireEvent.change(college, { target: { value: "Pyrford" } });
    expect(screen.queryAllByLabelText("Reason for the change")).toHaveLength(0);
  });

  // B2, LAN-185 correction round 2 (Brian's walk): the emergency contact's
  // five fields must render as their own labelled group, the way the record
  // itself reads them as one subject.
  it("groups the emergency contact under its own labelled heading", async () => {
    signedInAs(["secretary"]);
    vi.mocked(personVersion).mockResolvedValue(null);
    vi.mocked(readCurrentSeason).mockResolvedValue({
      id: "33333333-1111-4111-8111-111111111111",
      label: "2026-27",
    } as never);
    vi.mocked(readPersonRecord).mockResolvedValue(populatedRecord());

    const element = await EditPersonPage(pageProps());
    render(element);

    expect(screen.getByText("Restricted")).toBeTruthy();
    expect(screen.getByText("Emergency contact")).toBeTruthy();
  });

  // B3, LAN-185 correction round 2 (Brian's walk): mobile used to throw the
  // operator onto a whole separate "Correct this record" screen with its own
  // lone reason box and Save button. It must be one inline interaction like
  // every other field — the normalised preview shown before the save, with
  // no second screen.
  it("previews a changed mobile number inline, with no second screen", async () => {
    signedInAs(["secretary"]);
    vi.mocked(personVersion).mockResolvedValue(null);
    vi.mocked(readCurrentSeason).mockResolvedValue({
      id: "33333333-1111-4111-8111-111111111111",
      label: "2026-27",
    } as never);
    vi.mocked(readPersonRecord).mockResolvedValue(populatedRecord());

    const element = await EditPersonPage(pageProps());
    const { container } = render(element);

    expect(screen.queryByText(/Will be saved as/)).toBeNull();

    const mobile = screen.getByLabelText("Mobile phone");
    fireEvent.change(mobile, { target: { value: "+44 7700 900988" } });

    expect(screen.getByText(/Will be saved as/)).toBeTruthy();
    // Still the one page, the one heading, the one Save button — never a
    // second screen.
    expect(screen.getAllByRole("heading", { name: "Correct this record" })).toHaveLength(1);
    expect(container.querySelectorAll('button[type="submit"]').length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Save" })).toHaveLength(1);
  });
});

/**
 * LAN-389, entry points 6 and 7 of 10 (Clint, 2026-09-17). This is the form
 * the decision carves out: a number already on file that nobody touched is
 * not retyped, and only a change asks for confirmation. Both phones on the
 * screen — the person's mobile and their emergency contact's — answer the
 * same way.
 */
describe("the confirm boxes on the edit form", () => {
  async function editScreen() {
    vi.mocked(submitPersonEdit).mockClear();
    vi.mocked(submitPersonEdit).mockResolvedValue(INITIAL_EDIT_STATE);
    signedInAs(["secretary"]);
    vi.mocked(personVersion).mockResolvedValue(null);
    vi.mocked(readCurrentSeason).mockResolvedValue({
      id: "33333333-1111-4111-8111-111111111111",
      label: "2026-27",
    } as never);
    vi.mocked(readPersonRecord).mockResolvedValue(populatedRecord());
    return render(await EditPersonPage(pageProps()));
  }

  it("asks nothing of two numbers on file that nobody touched", async () => {
    const { container } = await editScreen();

    await act(async () => {
      fireEvent.submit(container.querySelector("form")!);
    });

    expect(submitPersonEdit).toHaveBeenCalledTimes(1);
    const posted = vi.mocked(submitPersonEdit).mock.calls[0][1];
    expect(posted.get("mobile")).toBe("+447700900412");
    expect(posted.get("emergencyPhone")).toBe("+447700900136");
  });

  it("refuses a changed mobile whose confirmation disagrees", async () => {
    const { container } = await editScreen();

    fireEvent.change(screen.getByLabelText("Mobile phone"), { target: { value: "7700900988" } });
    fireEvent.change(screen.getByLabelText(/^Confirm mobile phone/), {
      target: { value: "7700900989" },
    });

    await act(async () => {
      fireEvent.submit(container.querySelector("form")!);
    });

    expect(submitPersonEdit).not.toHaveBeenCalled();
    expect(screen.getByText("Does not match the number above.")).toBeTruthy();
  });

  it("refuses a changed emergency contact phone whose confirmation disagrees", async () => {
    const { container } = await editScreen();

    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "7700900777" } });
    fireEvent.change(screen.getByLabelText(/^Confirm phone/), {
      target: { value: "7700900778" },
    });

    await act(async () => {
      fireEvent.submit(container.querySelector("form")!);
    });

    expect(submitPersonEdit).not.toHaveBeenCalled();
    expect(screen.getByText("Does not match the number above.")).toBeTruthy();
  });

  it("saves the first field's number once the two agree", async () => {
    const { container } = await editScreen();

    fireEvent.change(screen.getByLabelText("Mobile phone"), { target: { value: "7700900988" } });
    fireEvent.change(screen.getByLabelText(/^Confirm mobile phone/), {
      target: { value: "7700900988" },
    });

    await act(async () => {
      fireEvent.submit(container.querySelector("form")!);
    });

    expect(submitPersonEdit).toHaveBeenCalledTimes(1);
    const posted = vi.mocked(submitPersonEdit).mock.calls[0][1];
    expect(posted.get("mobile")).toBe("+447700900988");
    expect([...posted.keys()].filter((key) => key.toLowerCase().includes("confirm"))).toEqual([]);
  });
});
