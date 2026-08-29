/**
 * `W7-01` … `W7-05`, `W7-07` — the missing-data queue. LAN-184.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("@/lib/services/people-directory", () => ({
  listMissingDataQueue: vi.fn(),
  DEFAULT_MISSING_SORT: "missing",
  MISSING_QUEUE_SORT_COLUMNS: ["missing", "name"],
}));

import { resolveOperatorAccess, type OperatorAccess } from "@/lib/auth/operator";
import { listMissingDataQueue } from "@/lib/services/people-directory";
import MissingDataPage from "./page";

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
  it("is refused, and the queue is never fetched", async () => {
    signedInAs(["treasurer"]);

    render(await MissingDataPage(pageProps()));

    expect(
      screen.getByRole("heading", { name: "You do not have access to this action" }),
    ).toBeVisible();
    expect(listMissingDataQueue).not.toHaveBeenCalled();
  });
});

describe("the missing-data queue, for an authorized operator", () => {
  it("names the missing facts per row and shows no value", async () => {
    signedInAs(["secretary"]);
    vi.mocked(listMissingDataQueue).mockResolvedValue({
      season: SEASON,
      scope: "in_season",
      totalMissing: 1,
      entries: [
        {
          personId: "p1",
          displayName: "Bertram",
          matchedAlias: null,
          status: "active",
          clubRoleSummary: "Player",
          hasMobile: true,
          hasPersonalEmail: false,
          missingRequiredFields: ["family_name", "emergency_contact"],
        },
      ],
    });

    const { container } = render(await MissingDataPage(pageProps()));

    // jsdom does not evaluate MUI's `sx` breakpoints (`roster/screens.test.tsx`'s
    // own documented limitation), so both the desktop table row and the phone
    // card render — hence `getAllByText`, not `getByText`.
    expect(screen.getAllByText("Last name").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Emergency contact").length).toBeGreaterThan(0);
    // Never a value — no phone number, email address or date anywhere.
    expect(container.innerHTML).not.toMatch(/@|\+44|\d{4}-\d{2}-\d{2}/);
  });

  it("filters to everybody missing one fact, and the row routes to correction", async () => {
    signedInAs(["secretary"]);
    vi.mocked(listMissingDataQueue).mockResolvedValue({
      season: SEASON,
      scope: "in_season",
      totalMissing: 1,
      entries: [
        {
          personId: "p2",
          displayName: "Gideon Inglewhite",
          matchedAlias: null,
          status: "inactive",
          clubRoleSummary: "Player",
          hasMobile: true,
          hasPersonalEmail: true,
          missingRequiredFields: ["emergency_contact"],
        },
      ],
    });

    render(await MissingDataPage(pageProps({ fact: "emergency_contact" })));

    expect(screen.getAllByRole("link", { name: "Correct" })[0]).toHaveAttribute(
      "href",
      "/operate/people/p2/edit?from=missing",
    );
  });

  it("distinguishes nobody-missing-anything from a filter matching nothing", async () => {
    signedInAs(["secretary"]);

    vi.mocked(listMissingDataQueue).mockResolvedValue({
      season: SEASON,
      scope: "in_season",
      totalMissing: 0,
      entries: [],
    });
    const empty = render(await MissingDataPage(pageProps()));
    expect(empty.getByTestId("missing-empty")).toBeVisible();
    expect(empty.getByText("Every required fact is recorded")).toBeVisible();

    vi.mocked(listMissingDataQueue).mockResolvedValue({
      season: SEASON,
      scope: "in_season",
      totalMissing: 5,
      entries: [],
    });
    const filtered = render(await MissingDataPage(pageProps({ q: "Nobody Named This" })));
    expect(filtered.getByTestId("missing-filter-empty")).toBeVisible();
  });
});

describe("the desktop table's Missing column — W7-01, correcting F1", () => {
  it("carries no separate How much column; the Missing column itself sorts by how much is missing", async () => {
    signedInAs(["secretary"]);
    vi.mocked(listMissingDataQueue).mockResolvedValue({
      season: SEASON,
      scope: "in_season",
      totalMissing: 1,
      entries: [
        {
          personId: "p1",
          displayName: "Bertram",
          matchedAlias: null,
          status: "active",
          clubRoleSummary: "Player",
          hasMobile: true,
          hasPersonalEmail: false,
          missingRequiredFields: ["family_name", "emergency_contact"],
        },
      ],
    });

    render(await MissingDataPage(pageProps()));

    // The approved W7-01 mockup draws five columns — Name, Status, To the
    // club, Missing, action — with sorting reached through the Missing
    // header itself, never a separate numeric column.
    const table = screen.getByRole("table", { name: "Missing data" });
    expect(within(table).queryByText("How much")).not.toBeInTheDocument();
    // The count that the removed column used to render as a bare number
    // (2, for these two gaps) must not have moved into a bare table cell.
    expect(within(table).queryByText("2", { selector: "td" })).not.toBeInTheDocument();

    const missingHeader = within(table).getByRole("link", { name: /Missing/ });
    expect(missingHeader).toHaveAttribute("href", expect.stringContaining("sort=missing"));
  });

  it("sorted by name ascending, still offers sorting to missing (most-missing-first default)", async () => {
    signedInAs(["secretary"]);
    vi.mocked(listMissingDataQueue).mockResolvedValue({
      season: SEASON,
      scope: "in_season",
      totalMissing: 1,
      entries: [
        {
          personId: "p1",
          displayName: "Bertram",
          matchedAlias: null,
          status: "active",
          clubRoleSummary: "Player",
          hasMobile: true,
          hasPersonalEmail: false,
          missingRequiredFields: ["emergency_contact"],
        },
      ],
    });

    render(await MissingDataPage(pageProps({ sort: "name", dir: "asc" })));
    const table = screen.getByRole("table", { name: "Missing data" });
    expect(within(table).getByRole("link", { name: /Missing/ })).toHaveAttribute(
      "href",
      expect.stringContaining("sort=missing"),
    );
    expect(within(table).getByRole("link", { name: /Name/ })).toHaveAttribute(
      "href",
      expect.stringContaining("dir=desc"),
    );
  });

  it("sorted by missing descending, still offers sorting to name and flips its own direction", async () => {
    signedInAs(["secretary"]);
    vi.mocked(listMissingDataQueue).mockResolvedValue({
      season: SEASON,
      scope: "in_season",
      totalMissing: 1,
      entries: [
        {
          personId: "p1",
          displayName: "Bertram",
          matchedAlias: null,
          status: "active",
          clubRoleSummary: "Player",
          hasMobile: true,
          hasPersonalEmail: false,
          missingRequiredFields: ["emergency_contact"],
        },
      ],
    });

    render(await MissingDataPage(pageProps({ sort: "missing", dir: "desc" })));
    const table = screen.getByRole("table", { name: "Missing data" });
    expect(within(table).getByRole("link", { name: /Name/ })).toHaveAttribute(
      "href",
      expect.stringContaining("sort=name"),
    );
    expect(within(table).getByRole("link", { name: /Missing/ })).toHaveAttribute(
      "href",
      expect.stringContaining("dir=asc"),
    );
  });
});
