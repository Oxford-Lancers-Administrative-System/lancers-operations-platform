/**
 * `W1-01` … `W1-04` — the People list. LAN-184.
 *
 * The database-backed season-tie logic is proved against the real database in
 * `src/lib/services/people-directory.test.ts`. This file proves what a render
 * can prove without one: the refusal is total (no person data reaches the
 * DOM), the copy and columns this package's mockup binds, and the two
 * distinguishable empty states.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("@/lib/services/people-directory", () => ({
  listPeople: vi.fn(),
  DEFAULT_PEOPLE_SORT: "name",
  PEOPLE_LIST_SORT_COLUMNS: ["name", "status", "club", "contactable", "missing"],
}));

import { resolveOperatorAccess, type OperatorAccess } from "@/lib/auth/operator";
import { listPeople } from "@/lib/services/people-directory";
import PeoplePage from "./page";

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

function pageProps(query: Record<string, string> = {}) {
  return { searchParams: Promise.resolve(query), params: Promise.resolve({}) } as never;
}

const SEASON = { id: "season-1", label: "2026-27", status: "active", startsOn: null, endsOn: null };

describe("an operator outside the four offices", () => {
  it("is refused, with no person data anywhere in the payload", async () => {
    // The Treasurer: a seated operator, holding no coaching seat and no
    // `person_record_authority` — the capability refusal itself, not the
    // separate narrow-attendance-recorder path a coach would take.
    signedInAs(["treasurer"]);
    vi.mocked(listPeople).mockResolvedValue({
      season: SEASON,
      scope: "in_season",
      entries: [
        {
          personId: "should-never-appear",
          displayName: "Should Never Appear",
          matchedAlias: null,
          status: "active",
          clubRoleSummary: "Player",
          hasMobile: true,
          hasPersonalEmail: true,
          missingRequiredFields: [],
        },
      ],
      totalInScope: 1,
    });

    const { container } = render(await PeoplePage(pageProps()));

    expect(
      screen.getByRole("heading", { name: "You do not have access to this action" }),
    ).toBeVisible();
    expect(container.innerHTML).not.toContain("Should Never Appear");
    // The service was never even called — the refusal happens before any
    // person data is fetched, not after it arrives and is hidden.
    expect(listPeople).not.toHaveBeenCalled();
  });
});

describe("the People list, for an authorized operator", () => {
  it("renders the six approved columns and the season subline", async () => {
    signedInAs(["secretary"]);
    vi.mocked(listPeople).mockResolvedValue({
      season: SEASON,
      scope: "in_season",
      entries: [
        {
          personId: "p1",
          displayName: "Fenwick Gorsemoor",
          matchedAlias: null,
          status: null,
          clubRoleSummary: "Head Coach",
          hasMobile: true,
          hasPersonalEmail: true,
          missingRequiredFields: [],
        },
      ],
      totalInScope: 1,
    });

    render(await PeoplePage(pageProps()));

    expect(screen.getByTestId("people-scope-label")).toHaveTextContent("Season 2026-27 · 1 person");
    expect(screen.getByRole("columnheader", { name: /Name/ })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: /Status/ })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: /To the club/ })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: /Contactable/ })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: /Missing/ })).toBeVisible();
    // Finding 8, Brian 2026-09-01, on the right — the sortable Player/Recruit column.
    expect(screen.getByRole("columnheader", { name: /Type/ })).toBeVisible();
    expect(screen.getByRole("link", { name: "Fenwick Gorsemoor" })).toHaveAttribute(
      "href",
      "/operate/people/p1",
    );
  });

  it("draws a Player chip for a player and a Recruit chip for a recruit, sortable by Type — finding 8", async () => {
    signedInAs(["secretary"]);
    vi.mocked(listPeople).mockResolvedValue({
      season: SEASON,
      scope: "in_season",
      entries: [
        {
          personId: "p1",
          displayName: "Fenwick Gorsemoor",
          matchedAlias: null,
          status: "active",
          clubRoleSummary: null,
          hasMobile: true,
          hasPersonalEmail: true,
          missingRequiredFields: [],
        },
        {
          personId: "p2",
          displayName: "Rosalind Penhaligon",
          matchedAlias: null,
          status: "recruit",
          clubRoleSummary: null,
          hasMobile: true,
          hasPersonalEmail: false,
          missingRequiredFields: [],
        },
      ],
      totalInScope: 2,
    });

    render(await PeoplePage(pageProps()));

    const chips = screen.getAllByTestId("person-type-chip");
    expect(chips.map((chip) => chip.textContent)).toEqual(["Player", "Recruit"]);

    const typeHeader = screen.getByRole("columnheader", { name: /Type/ });
    expect(typeHeader.querySelector("a, button, [role='button']")).not.toBeNull();
  });

  it("shows which alias a search matched, distinct from the display name", async () => {
    signedInAs(["secretary"]);
    vi.mocked(listPeople).mockResolvedValue({
      season: SEASON,
      scope: "in_season",
      entries: [
        {
          personId: "p2",
          displayName: "Rowan Ashworth",
          matchedAlias: "Ro",
          status: "active",
          clubRoleSummary: "Player",
          hasMobile: true,
          hasPersonalEmail: false,
          missingRequiredFields: [],
        },
      ],
      totalInScope: 1,
    });

    render(await PeoplePage(pageProps({ q: "Ro" })));

    // jsdom does not evaluate MUI's `sx` breakpoints, so both the desktop row
    // and the phone card render — hence `getAllByText`, not `getByText`.
    for (const caption of screen.getAllByText(/matched alias/)) {
      expect(caption).toHaveTextContent("matched alias “Ro”");
    }
  });

  it("links the missing count into the queue, scoped to that person", async () => {
    signedInAs(["secretary"]);
    vi.mocked(listPeople).mockResolvedValue({
      season: SEASON,
      scope: "in_season",
      entries: [
        {
          personId: "p3",
          displayName: "Bertram",
          matchedAlias: null,
          status: "active",
          clubRoleSummary: "Player",
          hasMobile: true,
          hasPersonalEmail: false,
          missingRequiredFields: ["family_name", "personal_email"],
        },
      ],
      totalInScope: 1,
    });

    render(await PeoplePage(pageProps()));

    expect(screen.getByRole("link", { name: "2 missing" })).toHaveAttribute(
      "href",
      "/operate/people/missing?q=Bertram",
    );
  });

  it("shows the widened view distinctly, with a way back", async () => {
    signedInAs(["secretary"]);
    vi.mocked(listPeople).mockResolvedValue({
      season: SEASON,
      scope: "outside_season",
      entries: [
        {
          personId: "p4",
          displayName: "Kestrel Caldicott",
          matchedAlias: null,
          status: null,
          clubRoleSummary: "Alumnus",
          hasMobile: false,
          hasPersonalEmail: true,
          missingRequiredFields: [],
        },
      ],
      totalInScope: 202,
    });

    render(await PeoplePage(pageProps({ scope: "outside" })));

    expect(screen.getByTestId("people-scope-label")).toHaveTextContent(
      "Outside the 2026-27 season · 202 people",
    );
    expect(screen.getByRole("link", { name: "Back to this season" })).toHaveAttribute(
      "href",
      "/operate/people",
    );
  });

  it("distinguishes a filtered-empty result from a genuinely empty season", async () => {
    signedInAs(["secretary"]);

    vi.mocked(listPeople).mockResolvedValue({
      season: SEASON,
      scope: "in_season",
      entries: [],
      totalInScope: 12,
    });
    const filtered = render(await PeoplePage(pageProps({ q: "Kestrel" })));
    expect(filtered.getByTestId("people-filter-empty")).toBeVisible();

    vi.mocked(listPeople).mockResolvedValue({
      season: SEASON,
      scope: "in_season",
      entries: [],
      totalInScope: 0,
    });
    const empty = render(await PeoplePage(pageProps()));
    expect(empty.getByTestId("people-empty")).toBeVisible();
  });
});
