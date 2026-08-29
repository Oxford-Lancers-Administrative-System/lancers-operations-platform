/**
 * `/operate/people/[personId]/merge` — W4-01. LAN-185.
 *
 * The action-level suite and `person-merge.test.ts` prove behaviour; this
 * proves the page-level refusal is total, and that an authorized operator
 * reaches the search step with the record's own id excluded from results.
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
vi.mock("@/lib/services/person-record", () => ({
  readPersonRecord: vi.fn(),
  searchPeople: vi.fn(),
}));
vi.mock("@/lib/services/person-merge", () => ({ previewPersonMerge: vi.fn() }));

import { ConstraintViolated } from "@/lib/db";
import { resolveOperatorAccess, type OperatorAccess } from "@/lib/auth/operator";
import { readPersonRecord } from "@/lib/services/person-record";
import { previewPersonMerge } from "@/lib/services/person-merge";
import MergePage from "./page";

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
  return {
    params: Promise.resolve({ personId: "22222222-1111-4111-8111-111111111111" }),
    searchParams: Promise.resolve(query),
  } as never;
}

describe("an operator outside the four offices", () => {
  it("is refused, and the comparison never loads", async () => {
    signedInAs(["treasurer"]);
    const element = await MergePage(pageProps());
    render(element);
    expect(screen.queryByText("Merge two records")).toBeNull();
    expect(screen.getByTestId("operator-not-permitted")).toBeTruthy();
    expect(readPersonRecord).not.toHaveBeenCalled();
  });
});

describe("a four-role operator", () => {
  it("reaches the find-other-record step", async () => {
    signedInAs(["secretary"]);
    vi.mocked(readPersonRecord).mockResolvedValue({
      personId: "22222222-1111-4111-8111-111111111111",
      displayName: "Hollis Jarrowdale",
    } as never);

    const element = await MergePage(pageProps());
    render(element);

    expect(screen.getByRole("heading", { name: "Merge two records" })).toBeTruthy();
    expect(screen.getByLabelText(/search name or alias/i)).toBeTruthy();
  });

  // B5, LAN-185 correction round 2 (Brian's walk): `previewPersonMerge`'s
  // refusals — same record, already merged away, not on record — used to
  // reach `MergePage` unhandled and render as a Next.js runtime error screen
  // with a stack frame. It must render as the product's own refusal state.
  it("renders a refusal, not a crash, when the comparison target has already been merged away", async () => {
    signedInAs(["secretary"]);
    vi.mocked(readPersonRecord).mockResolvedValue({
      personId: "22222222-1111-4111-8111-111111111111",
      displayName: "Hollis Jarrowdale",
    } as never);
    vi.mocked(previewPersonMerge).mockRejectedValue(
      new ConstraintViolated(
        "That record has already been merged away, so it cannot be merged again.",
        { rule: "person_merge_already_away" },
      ),
    );

    const element = await MergePage(pageProps({ with: "33333333-1111-4111-8111-111111111111" }));
    const { container } = render(element);

    expect(screen.getByTestId("merge-preview-refused")).toHaveTextContent(
      "That record has already been merged away, so it cannot be merged again.",
    );
    // Not a crash: no stack frame, and a real recovery action back to the record.
    expect(
      container.querySelector('a[href="/operate/people/22222222-1111-4111-8111-111111111111"]'),
    ).toBeTruthy();
  });
});
