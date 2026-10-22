/**
 * LAN-497 — Group by on the event page's Everyone asked table (Brian's walk,
 * 22 October 2026): the register's own select in the filter bar, one choice
 * shared with the register, and the table split into the register's
 * collapsible sections with each group's attendance on its header.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));

const routerPush = vi.fn();
const routerReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace, refresh: vi.fn() }),
  usePathname: () => "/operate/events/event-1",
  redirect: vi.fn(),
  notFound: vi.fn(),
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));

import { attendanceGroupByStorageKey } from "@/lib/services/attendance-group-by";
import {
  EMPTY_FILTERS,
  type OperatorParticipation,
  type OperatorParticipationPerson,
  type ParticipationFilters,
} from "@/lib/services/participation-view";
import { withGroupValues } from "@/lib/services/participation-sections";
import { OFFENSIVE_POSITION_GROUP_VALUES } from "@/lib/services/roster-board/vocabulary";

import { ParticipationFilterBar } from "./participation-filters";
import { ParticipationTable } from "./participation-table";

const [FIRST, SECOND] = OFFENSIVE_POSITION_GROUP_VALUES;
const PERSON_ID = "22222222-2222-4222-8222-222222222222";
const STORAGE_KEY = attendanceGroupByStorageKey(PERSON_ID);

function row(
  id: string,
  name: string,
  capacity: string,
  answer: "yes" | "no" | null,
  presence: OperatorParticipationPerson["presence"],
): OperatorParticipationPerson {
  return {
    key: `${capacity}:${id}`,
    displayName: name,
    capacity,
    isWalkUp: false,
    invitedAt: null,
    answer,
    reason: null,
    presence,
    discrepancy: null,
    answers: {},
    delivery: "delivered",
  };
}

const PEOPLE = [
  row("c1", "Cora Coach", "coach", "yes", "present"),
  row("p1", "Ann Player", "player", "yes", "present"),
  row("p2", "Ben Player", "player", "yes", null),
  row("p3", "Cal Player", "player", "no", "late"),
  row("p4", "Dan Player", "player", null, null),
];

const GROUPS = {
  p1: { offensive: [FIRST] },
  p2: { offensive: [FIRST, SECOND] },
  p3: { offensive: [SECOND] },
  p4: { offensive: [] },
};

function participation(): OperatorParticipation {
  return {
    tier: "operator",
    event: {
      id: "event-1",
      name: "Practice",
      status: "approved",
      eventType: "practice",
      templateName: "Practice",
      scheduledOn: "2026-10-14",
      startsAt: "20:00",
      endsAt: "22:00",
      venue: null,
      deliveryMode: "in_person",
      description: null,
      requiredEquipment: null,
      isMandatory: false,
      termLabel: "michaelmas 2026-27",
      weekNumber: 6,
      joiningUrl: null,
    },
    questions: [],
    people: withGroupValues(PEOPLE, GROUPS),
    headline: { invited: 5, saidYes: 3, saidNo: 1, showed: 3, registerSaved: true },
  } as unknown as OperatorParticipation;
}

function filters(patch: Partial<ParticipationFilters> = {}): ParticipationFilters {
  return { ...EMPTY_FILTERS, ...patch };
}

function table(props: { groupBy?: "offensive" | null; tally?: boolean; f?: ParticipationFilters }) {
  return render(
    <ParticipationTable
      basePath="/operate/events/event-1"
      participation={participation()}
      filters={props.f ?? filters()}
      groupBy={props.groupBy ?? null}
      showAttendanceTally={props.tally ?? false}
    />,
  );
}

function sectionKeys(): string[] {
  return [...document.querySelectorAll('[data-testid^="participation-group-"][data-open]')].map(
    (node) => node.getAttribute("data-testid")!.replace("participation-group-", ""),
  );
}

function namesIn(key: string): string[] {
  const section = screen.getByTestId(`participation-group-${key}`);
  return [...section.querySelectorAll('[data-testid="participation-row"]')].map(
    (node) => node.querySelector("td")?.textContent?.trim() ?? "",
  );
}

beforeEach(() => {
  routerPush.mockReset();
  routerReplace.mockReset();
  window.localStorage.clear();
});

describe("the Everyone asked table, grouped", () => {
  it("is one flat table with no Group by", () => {
    table({});
    expect(screen.queryByTestId("participation-sections")).toBeNull();
  });

  it("puts Coaches first, then the family's groups, then No group last", () => {
    table({ groupBy: "offensive" });
    expect(sectionKeys()).toEqual([
      "coaches",
      expect.stringMatching(/^group-/),
      expect.stringMatching(/^group-/),
      "no-group",
    ]);
    expect(namesIn("coaches")).toEqual(["Cora Coach"]);
    fireEvent.click(screen.getByTestId("participation-group-toggle-no-group"));
    expect(namesIn("no-group")).toEqual(["Dan Player"]);
  });

  it("shows each section's attended / expected once the event has occurred", () => {
    table({ groupBy: "offensive", tally: true });
    const coaches = screen.getByTestId("participation-group-coaches");
    expect(within(coaches).getByText("1 attended / 1 expected")).toBeVisible();
    // Ann present; Ben said yes and has no mark: a no-show.
    const first = screen.getAllByText("1 attended / 2 expected");
    expect(first.length).toBeGreaterThanOrEqual(1);
  });

  it("shows no attendance on a section before the event has occurred", () => {
    table({ groupBy: "offensive", tally: false });
    expect(screen.queryByText(/attended \//)).toBeNull();
  });

  it("opens every group on arrival except No group, which opens on a click", () => {
    table({ groupBy: "offensive" });
    expect(screen.getByTestId("participation-group-coaches")).toHaveAttribute("data-open", "true");
    expect(screen.getByTestId("participation-group-no-group")).toHaveAttribute(
      "data-open",
      "false",
    );
    fireEvent.click(screen.getByTestId("participation-group-toggle-no-group"));
    expect(screen.getByTestId("participation-group-no-group")).toHaveAttribute("data-open", "true");
  });

  it("applies the filters within each section", () => {
    table({ groupBy: "offensive", f: filters({ answer: "yes" }) });
    expect(namesIn("coaches")).toEqual(["Cora Coach"]);
    // Dan has no answer, so No group has nobody left and is omitted.
    expect(sectionKeys()).not.toContain("no-group");
  });

  it("carries the chosen Group by on every sort link", () => {
    table({ groupBy: "offensive" });
    const links = [...document.querySelectorAll("a[href*='sort=']")];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link.getAttribute("href")).toContain("by=offensive");
  });
});

describe("the Group by select in the filter bar", () => {
  function bar(
    families: ("offensive" | "warmup")[],
    groupBy: "offensive" | "warmup" | null = null,
  ) {
    return render(
      <ParticipationFilterBar
        basePath="/operate/events/event-1"
        filters={filters()}
        showDelivery
        groupFamilies={families}
        groupBy={groupBy}
        storageKey={STORAGE_KEY}
      />,
    );
  }

  it("is absent for a viewer who may see no family", () => {
    bar([]);
    expect(screen.queryByTestId("attendance-group-by")).toBeNull();
  });

  it("follows Answer, Attendance and Delivery", () => {
    bar(["offensive"]);
    const order = [...document.querySelectorAll("[data-testid]")]
      .map((node) => node.getAttribute("data-testid"))
      .filter((id) =>
        ["filter-answer", "filter-attendance", "filter-delivery", "attendance-group-by"].includes(
          id ?? "",
        ),
      );
    expect(order).toEqual([
      "filter-answer",
      "filter-attendance",
      "filter-delivery",
      "attendance-group-by",
    ]);
  });

  it("offers None and only the families the viewer may see", () => {
    bar(["warmup"]);
    fireEvent.mouseDown(screen.getByRole("combobox", { name: /Group by/ }));
    const listbox = screen.getByRole("listbox");
    expect(
      within(listbox)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["None", "Warmup group"]);
  });

  it("puts the choice in the link under `by` and remembers it under the register's key", () => {
    bar(["offensive", "warmup"]);
    fireEvent.mouseDown(screen.getByRole("combobox", { name: /Group by/ }));
    fireEvent.click(screen.getByRole("option", { name: "Offensive position group" }));
    expect(routerPush.mock.calls.at(-1)?.[0]).toContain("by=offensive");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("offensive");
  });

  it("opens on the choice made on the register, with the same key", () => {
    window.localStorage.setItem(STORAGE_KEY, "warmup");
    bar(["offensive", "warmup"]);
    expect(routerReplace).toHaveBeenCalledTimes(1);
    expect(routerReplace.mock.calls[0][0]).toContain("by=warmup");
  });

  it("ignores a remembered family the viewer may no longer see", () => {
    window.localStorage.setItem(STORAGE_KEY, "warmup");
    bar(["offensive"]);
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("does not override a link that already names a choice", () => {
    window.localStorage.setItem(STORAGE_KEY, "warmup");
    bar(["offensive", "warmup"], "offensive");
    expect(routerReplace).not.toHaveBeenCalled();
  });
});
