/**
 * `/operate/admin/guide/workflows` and `/operate/admin/guide/<slug>` — the
 * screens. LAN-399.
 *
 * The assertion that matters is the first one, and it is the same argument the
 * existing How administration works page's test makes: this is a section of
 * pages that only explains things, which is exactly the kind of surface
 * somebody leaves open. Brian decided the audience on 21 September 2026 — the
 * core four — and a decided audience is only real if something checks it. So
 * these tests drive the real gate with real role codes, seat by seat, and
 * assert that the IT Officer is refused: it holds every other entry in the
 * Administration group, so it is the one seat a reader would expect to pass.
 *
 * After that, the things a reader would notice broken: the index lists eight
 * and every link resolves; each page renders its own drawing with an `alt` and
 * the description beneath it; and the seat table appears on exactly one page.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  usePathname: () => "/operate/admin/guide/workflows",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("../../login/actions", () => ({ signOut: vi.fn() }));

import { resolveOperatorAccess, type ResolvedOperator } from "@/lib/auth/operator";
import { CAPABILITY_KEYS, ROLE_LABELS, roleCodesPermit } from "@/lib/auth/capabilities";
import { PLAYBOOK_PAGES, PLAYBOOK_TITLE } from "./_playbook/content";
import PlaybookIndexPage from "./workflows/page";
import PlaybookWorkflowPage, { generateStaticParams } from "./[slug]/page";

const resolve = vi.mocked(resolveOperatorAccess);

function operator(roleCodes: string[]): ResolvedOperator {
  return {
    authUserId: "00000000-0000-4000-8000-000000000011",
    personId: "00000000-0000-4000-8000-000000000012",
    displayName: "Test Operator",
    roleCodes,
    isActive: true,
  };
}

function signedInAs(roleCode: string) {
  resolve.mockResolvedValue({ state: "active", operator: operator([roleCode]) });
}

async function renderIndex() {
  return render(await PlaybookIndexPage());
}

async function renderWorkflow(slug: string) {
  return render(
    await PlaybookWorkflowPage({
      params: Promise.resolve({ slug }),
      searchParams: Promise.resolve({}),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("who may read the playbook", () => {
  // Brian, 21 September 2026 (LAN-399): the core four. Driven individually,
  // because a single shared "an officer" fixture would pass if the page gated
  // on any one of them.
  const CORE_FOUR = ["president", "vice_president", "secretary", "general_manager"];

  it.each(CORE_FOUR)("opens the index for %s", async (roleCode) => {
    signedInAs(roleCode);

    await renderIndex();

    expect(screen.getByRole("heading", { level: 1, name: PLAYBOOK_TITLE })).toBeVisible();
  });

  it.each(CORE_FOUR)("opens every workflow page for %s", async (roleCode) => {
    for (const page of PLAYBOOK_PAGES) {
      signedInAs(roleCode);
      const { unmount } = await renderWorkflow(page.slug);
      expect(screen.getByRole("heading", { level: 1, name: page.name }), page.slug).toBeVisible();
      unmount();
    }
  });

  // The IT Officer holds every other Administration entry, which is exactly
  // why it is asserted here: a reader adding it back would be restoring what
  // looks like an oversight, and this is the test that says it is not one.
  it.each(["it_officer", "head_coach", "media_secretary", "treasurer", "kit_manager"])(
    "refuses %s, and renders none of it",
    async (roleCode) => {
      signedInAs(roleCode);

      const { container } = await renderIndex();

      expect(screen.queryByRole("heading", { level: 1, name: PLAYBOOK_TITLE })).toBeNull();
      for (const page of PLAYBOOK_PAGES) {
        expect(container.textContent, page.slug).not.toContain(page.summary);
      }
    },
  );

  it.each(["it_officer", "head_coach", "media_secretary"])(
    "refuses %s each workflow page individually",
    async (roleCode) => {
      // Not just the index. A refused reader who guessed a slug must be
      // refused there too — the index is a courtesy, the gate is the boundary.
      for (const page of PLAYBOOK_PAGES) {
        signedInAs(roleCode);
        const { container, unmount } = await renderWorkflow(page.slug);
        expect(
          screen.queryByRole("heading", { level: 1, name: page.name }),
          `${roleCode} / ${page.slug}`,
        ).toBeNull();
        expect(container.querySelector("img")).toBeNull();
        unmount();
      }
    },
  );

  it("sends a reader with no session to sign in, carrying the page they wanted", async () => {
    resolve.mockResolvedValue({ state: "no_session" });

    await expect(renderWorkflow("events")).rejects.toThrow(
      "REDIRECT:/login?redirectTo=%2Foperate%2Fadmin%2Fguide%2Fevents",
    );
  });

  it("refuses before it looks the slug up", async () => {
    // An unauthorised reader must not be able to tell a real workflow from a
    // typo by which screen they get back.
    signedInAs("it_officer");

    const { container } = await renderWorkflow("not-a-workflow");

    expect(container.textContent).not.toBe("");
    expect(container.querySelector("img")).toBeNull();
  });

  it("is not-found for a permitted reader who guesses a slug", async () => {
    signedInAs("president");

    await expect(renderWorkflow("not-a-workflow")).rejects.toThrow("NOT_FOUND");
  });
});

describe("the index", () => {
  beforeEach(() => signedInAs("president"));

  it("lists the eight workflows, and links each one", async () => {
    await renderIndex();

    for (const page of PLAYBOOK_PAGES) {
      expect(screen.getByRole("link", { name: page.name })).toHaveAttribute(
        "href",
        `/operate/admin/guide/${page.slug}`,
      );
      expect(screen.getByText(page.summary)).toBeVisible();
    }
    expect(screen.queryByRole("link", { name: /^Open / })).toBeNull();
  });

  it("links the existing How administration works page rather than replacing it", async () => {
    await renderIndex();

    expect(screen.getByRole("link", { name: "How administration works" })).toHaveAttribute(
      "href",
      "/operate/admin/guide",
    );
    expect(screen.queryByRole("link", { name: /^Open / })).toBeNull();
  });

  it("pre-renders exactly the eight slugs", () => {
    expect(generateStaticParams()).toEqual(PLAYBOOK_PAGES.map((page) => ({ slug: page.slug })));
  });
});

describe("a workflow page", () => {
  beforeEach(() => signedInAs("general_manager"));

  it.each(PLAYBOOK_PAGES.map((page) => [page.slug, page] as const))(
    "%s renders its drawing with an alt and the same drawing in words",
    async (_slug, page) => {
      await renderWorkflow(page.slug);

      const image = screen.getByAltText(page.flowchart.alt);
      expect(image).toHaveAttribute("src", `/guide/${page.slug}.svg`);

      // The description is beneath the drawing, not instead of it.
      const described = within(screen.getByTestId("section-playbook-flowchart"));
      expect(described.getByRole("list")).toBeVisible();
    },
  );

  it.each(PLAYBOOK_PAGES.map((page) => [page.slug] as const))(
    "%s carries steps, rules and where to look",
    async (slug) => {
      await renderWorkflow(slug);

      expect(screen.getByTestId("section-playbook-steps")).toBeVisible();
      expect(screen.getByTestId("section-playbook-rules")).toBeVisible();
      expect(screen.getByTestId("section-playbook-where-to-look")).toBeVisible();
    },
  );

  it("offers a way back to the index", async () => {
    await renderWorkflow("roster");

    expect(screen.getByTestId("back-link")).toHaveAttribute(
      "href",
      "/operate/admin/guide/workflows",
    );
  });
});

describe("the seat table", () => {
  beforeEach(() => signedInAs("secretary"));

  it("appears on Operators and roles and on no other page", async () => {
    for (const page of PLAYBOOK_PAGES) {
      signedInAs("secretary");
      const { unmount } = await renderWorkflow(page.slug);
      const table = screen.queryByTestId("capability-table");
      expect(Boolean(table), page.slug).toBe(page.slug === "operators-and-roles");
      unmount();
    }
  });

  it("reads every mark in the grid from the capability map", async () => {
    await renderWorkflow("operators-and-roles");

    // The requirement is that the table cannot drift. Asserted as the
    // equivalence rather than by reading cells back: every seat with a grant
    // has a row, and every seat without one has none.
    for (const code of Object.keys(ROLE_LABELS)) {
      const holds = CAPABILITY_KEYS.some((key) => roleCodesPermit([code], key));
      expect(Boolean(screen.queryByTestId(`capability-row-${code}`)), code).toBe(holds);
    }
  });

  it("shows the President a row and the Kit Manager none", async () => {
    await renderWorkflow("operators-and-roles");

    expect(screen.getByTestId("capability-row-president")).toBeVisible();
    expect(screen.queryByTestId("capability-row-kit_manager")).toBeNull();
  });
});
