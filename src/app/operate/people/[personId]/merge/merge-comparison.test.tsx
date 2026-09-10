/**
 * `/operate/people/[personId]/merge` — the comparison screen itself. LAN-256.
 *
 * The service refuses an unanswered difference (`person-merge.test.ts`); this
 * proves the screen never presents one as already answered, and never offers
 * Merge while a question is outstanding. Both halves matter: the defect was a
 * screen that answered for the operator, and the button that acted on it.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("./actions", () => ({ submitMerge: vi.fn() }));

import type { PersonMergePreview } from "@/lib/services/person-merge";
import MergeComparison from "./merge-comparison";

const SURVIVOR = "11111111-1111-4111-8111-111111111111";
const LOSER = "22222222-2222-4222-8222-222222222222";

/**
 * The walker's own pair: a near-duplicate holding almost nothing, and the
 * complete record it duplicates.
 */
function preview(overrides: Partial<PersonMergePreview> = {}): PersonMergePreview {
  return {
    survivor: {
      personId: SURVIVOR,
      displayName: "Yor",
      statusLabel: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    },
    loser: {
      personId: LOSER,
      displayName: "Yorick Ashgrove",
      statusLabel: null,
      createdAt: new Date("2025-01-01T00:00:00Z"),
    },
    refusal: null,
    fields: [
      {
        field: "given_name",
        label: "First name",
        survivorValue: "Yor",
        loserValue: "Yor",
        differs: false,
        needsChoice: false,
      },
      {
        field: "family_name",
        label: "Last name",
        survivorValue: null,
        loserValue: "Ashgrove",
        differs: false,
        needsChoice: true,
      },
      {
        field: "college",
        label: "College",
        survivorValue: "Ridgeway",
        loserValue: "Hallamshire",
        differs: true,
        needsChoice: true,
      },
    ],
    contacts: [
      {
        kind: "mobile",
        label: "Mobile phone",
        survivor: null,
        loser: { id: "c1", rawValue: "07700 900602" },
        differs: false,
        needsChoice: true,
      },
    ],
    aliases: { survivorAliases: [], loserAliases: [], differs: false },
    prospectCombinations: [],
    consentCombinations: [],
    willMove: [],
    staysWithLoser: [],
    ...overrides,
  };
}

function renderComparison(data: PersonMergePreview = preview()) {
  return render(<MergeComparison survivorRouteId={SURVIVOR} preview={data} />);
}

function mergeButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: "Merge" }) as HTMLButtonElement;
}

describe("the merge comparison", () => {
  it("pre-selects no side on any row the operator has to answer", () => {
    renderComparison();

    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).not.toBeChecked();
    }
  });

  it("keeps Merge unavailable, and says how many answers are outstanding", () => {
    renderComparison();

    expect(mergeButton()).toBeDisabled();
    expect(screen.getByTestId("merge-unanswered")).toHaveTextContent("3 unanswered");
  });

  it("offers Merge only once every difference has an answer", () => {
    renderComparison();

    fireEvent.click(
      within(screen.getByTestId("compare-row-field_family_name")).getByLabelText("Ashgrove"),
    );
    expect(mergeButton()).toBeDisabled();

    fireEvent.click(
      within(screen.getByTestId("compare-row-field_college")).getByLabelText("Hallamshire"),
    );
    expect(mergeButton()).toBeDisabled();
    expect(screen.getByTestId("merge-unanswered")).toHaveTextContent("1 unanswered");

    fireEvent.click(
      within(screen.getByTestId("compare-row-contact_mobile")).getByLabelText("07700 900602"),
    );
    expect(mergeButton()).toBeEnabled();
    expect(screen.queryByTestId("merge-unanswered")).not.toBeInTheDocument();
  });

  it("posts the operator's answers, and nothing for a row that was never a question", () => {
    const { container } = renderComparison();

    fireEvent.click(
      within(screen.getByTestId("compare-row-field_family_name")).getByLabelText("Ashgrove"),
    );
    fireEvent.click(
      within(screen.getByTestId("compare-row-field_college")).getByLabelText("Ridgeway"),
    );

    const form = container.querySelector("form")!;
    const posted = new FormData(form);
    expect(posted.get("field_family_name")).toBe("loser");
    expect(posted.get("field_college")).toBe("survivor");
    // The mobile row is still unanswered, and an unanswered row posts nothing
    // rather than quietly posting "survivor".
    expect(posted.get("contact_mobile")).toBeNull();
    // Two sides that agree are not a radio group at all.
    expect(posted.get("field_given_name")).toBeNull();
  });

  it("shows an agreeing row as the one value both records hold, not as a choice", () => {
    renderComparison();

    const row = screen.getByTestId("compare-row-field_given_name");
    expect(within(row).queryByRole("radio")).not.toBeInTheDocument();
    expect(row).toHaveTextContent("Yor");
  });

  it("asks nothing, and keeps Merge unavailable, when the merge is refused outright", () => {
    renderComparison(
      preview({
        refusal: {
          rule: "person_merge_active_operator_seat",
          message: "This record holds an active operator seat.",
        },
      }),
    );

    expect(mergeButton()).toBeDisabled();
    expect(screen.queryByTestId("merge-unanswered")).not.toBeInTheDocument();
    expect(screen.getByTestId("merge-refusal")).toBeInTheDocument();
  });
});
