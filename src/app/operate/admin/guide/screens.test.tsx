/**
 * `/operate/admin/guide` — the screen. LAN-134.
 *
 * Two things are under test, and the first is the one that matters.
 *
 * **The authorization binding.** `REQ-club-operating-guide` calls this "a
 * protected in-app guide", and the page is a page of prose — exactly the kind of
 * surface somebody leaves open because it "only explains things". What it
 * explains is who may act on whom, which seat cannot be touched from inside the
 * application, and where the club's last administrative path is. So these tests
 * drive the real gate with real role codes and assert that a reader without
 * `role_management` receives none of it. Gating on the wrong capability, or on
 * nothing, would pass typecheck and every other test in the suite.
 *
 * **The FAQ shape.** Expandable questions, real headings, and the whole guide
 * present in the markup rather than fetched on expansion — `REQ-club-operating-
 * guide` asks for FAQ-style expandable questions, and a reader searching the
 * page for "General Manager" should find it whether or not they guessed which
 * question to open.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  usePathname: () => "/operate/admin/guide",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("../../../login/actions", () => ({ signOut: vi.fn() }));

import { resolveOperatorAccess, type ResolvedOperator } from "@/lib/auth/operator";
import { ADMINISTRATION_GUIDE, GUIDE_SUBTITLE, GUIDE_TITLE } from "./content";
import GuideFaq from "./guide-faq";
import AdministrationGuidePage from "./page";

const resolve = vi.mocked(resolveOperatorAccess);

function operator(roleCodes: string[]): ResolvedOperator {
  return {
    authUserId: "00000000-0000-4000-8000-000000000001",
    personId: "00000000-0000-4000-8000-000000000002",
    displayName: "Test Operator",
    roleCodes,
    isActive: true,
  };
}

async function renderPage() {
  return render(await AdministrationGuidePage());
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("who may read the guide", () => {
  // The three seats DEC-role-management-authority names, driven individually:
  // a single shared "an administrator" fixture would pass if the page happened
  // to gate on any one of them.
  it.each(["president", "general_manager", "it_officer"])("opens for %s", async (roleCode) => {
    resolve.mockResolvedValue({ state: "active", operator: operator([roleCode]) });

    await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: GUIDE_TITLE })).toBeVisible();
    expect(screen.getByText(GUIDE_SUBTITLE)).toBeVisible();
  });

  it.each(["secretary", "vice_president", "head_coach"])(
    "refuses %s, and renders none of the guide",
    async (roleCode) => {
      resolve.mockResolvedValue({ state: "active", operator: operator([roleCode]) });

      const { container } = await renderPage();

      expect(screen.queryByRole("heading", { level: 1, name: GUIDE_TITLE })).toBeNull();
      // Not one answer, and not one question.
      //
      // The refusal screen does name the roles the action requires — that is
      // UX-05's approved wording and `capabilityRequirement()`'s job, and it is
      // a statement about the club's constitution rather than about a person.
      // What must not appear is the guide: the hierarchy's exceptions, the
      // final-path rule, and what each seat may do to which other seat.
      for (const entry of ADMINISTRATION_GUIDE) {
        expect(screen.queryByText(entry.question)).toBeNull();
      }
      expect(container.textContent).not.toContain("Forgot password?");
      expect(container.textContent).not.toContain("exceptional recovery");
      expect(container.textContent).not.toContain("leave the club with nobody");
    },
  );

  it("refuses an operator holding no role at all", async () => {
    resolve.mockResolvedValue({ state: "active", operator: operator([]) });

    await renderPage();

    expect(screen.queryByRole("heading", { level: 1, name: GUIDE_TITLE })).toBeNull();
  });

  it("sends a signed-out reader to the sign-in page, preserving this route", async () => {
    resolve.mockResolvedValue({ state: "no_session" });

    await expect(renderPage()).rejects.toThrow(
      "REDIRECT:/login?redirectTo=%2Foperate%2Fadmin%2Fguide",
    );
  });

  it.each(["unlinked", "inactive"] as const)("shows the account state for %s", async (state) => {
    resolve.mockResolvedValue({ state });

    await renderPage();

    expect(screen.queryByRole("heading", { level: 1, name: GUIDE_TITLE })).toBeNull();
  });
});

describe("the FAQ", () => {
  it("renders every question as a real heading", () => {
    render(<GuideFaq />);

    for (const entry of ADMINISTRATION_GUIDE) {
      expect(screen.getByRole("heading", { level: 2, name: entry.question })).toBeVisible();
    }
  });

  it("makes every question an expandable control", () => {
    render(<GuideFaq />);

    for (const entry of ADMINISTRATION_GUIDE) {
      const disclosure = screen.getByTestId(`section-${entry.id}`);
      expect(disclosure.tagName).toBe("DETAILS");
      expect(disclosure.querySelector("summary")).toHaveTextContent(entry.question);
    }
  });

  it("opens the first question and leaves the rest collapsed", () => {
    render(<GuideFaq />);

    const disclosures = ADMINISTRATION_GUIDE.map((entry) =>
      screen.getByTestId(`section-${entry.id}`),
    );
    expect(disclosures[0]).toHaveAttribute("open");
    for (const disclosure of disclosures.slice(1)) {
      expect(disclosure).not.toHaveAttribute("open");
    }
  });

  it("puts every answer in the markup, so the page can be searched", () => {
    const { container } = render(<GuideFaq />);

    // A sentence from a collapsed answer near the end of the list.
    expect(container.textContent).toContain("Only the General Manager may");
    expect(container.textContent).toContain("Forgot password?");
  });

  it("keeps every answer inside its own named native disclosure", () => {
    render(<GuideFaq />);

    for (const entry of ADMINISTRATION_GUIDE) {
      const disclosure = screen.getByTestId(`section-${entry.id}`);
      expect(disclosure.querySelector(`#${entry.id}-answer`)).not.toBeNull();
      expect(disclosure.querySelector("summary")).toHaveTextContent(entry.question);
    }
  });
});
