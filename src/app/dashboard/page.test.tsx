/**
 * `/dashboard` — the end-to-end wiring proof for LAN-71, reworded by LAN-95.
 *
 * Not a real screen and deliberately not treated as one. What is asserted is
 * only the contract in the acceptance criteria: signed in and resolved shows
 * the person and their role codes; signed in and unresolved shows one accurate
 * unresolved state rather than a blank page or a crash; and no session still
 * redirects, which is behaviour that existed before this issue and must not
 * have been broken by it.
 *
 * The wording is asserted literally. It is the whole subject of LAN-95's E1:
 * LAN-71's "No operator record is linked to this account" is false for a
 * deactivated operator, whose record *is* linked, and sent that person
 * somewhere useless. A paraphrase-tolerant assertion would let the old claim
 * back in.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/** The single unresolved state, exactly as Brian worded it on 2026-08-11. */
const UNRESOLVED_MESSAGE = "This account cannot access the operator area. Contact the committee.";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    // The real `redirect` throws to unwind the render. Mirroring that keeps the
    // component's control flow honest instead of letting it fall through.
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth/operator", () => ({ resolveOperator: vi.fn() }));
vi.mock("../login/actions", () => ({ signOut: vi.fn() }));

import { resolveOperator } from "@/lib/auth/operator";
import { createClient } from "@/lib/supabase/server";
import DashboardPage from "./page";

function givenSignedInAs(email: string | null) {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: () =>
        Promise.resolve(
          email === null
            ? { data: { user: null }, error: { message: "no session" } }
            : { data: { user: { id: "auth-user-id", email } }, error: null },
        ),
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/dashboard", () => {
  it("names the resolved operator and lists their role codes", async () => {
    givenSignedInAs("test.user@oxfordlancers.local");
    vi.mocked(resolveOperator).mockResolvedValue({
      authUserId: "auth-user-id",
      personId: "person-id",
      displayName: "Caspian Hallowfield",
      roleCodes: ["it_officer", "media_secretary", "secretary"],
      isActive: true,
    });

    render(await DashboardPage());

    expect(screen.getByText("Caspian Hallowfield")).toBeInTheDocument();
    for (const code of ["it_officer", "media_secretary", "secretary"]) {
      expect(screen.getByText(code)).toBeInTheDocument();
    }
    expect(screen.queryByText(UNRESOLVED_MESSAGE)).not.toBeInTheDocument();
  });

  it("shows the single unresolved state when the session resolves to no operator", async () => {
    givenSignedInAs("stranger@oxfordlancers.local");
    vi.mocked(resolveOperator).mockResolvedValue(null);

    render(await DashboardPage());

    // Never a blank page, never a crash, and never a silent fallback to some
    // default identity.
    expect(screen.getByText(UNRESOLVED_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /protected page/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  it("no longer claims no record is linked, which was false for a deactivated one", async () => {
    givenSignedInAs("deactivated.operator@oxfordlancers.local");
    vi.mocked(resolveOperator).mockResolvedValue(null);

    render(await DashboardPage());

    expect(screen.queryByText(/no operator record is linked/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/not linked/i)).not.toBeInTheDocument();
  });

  it("shows exactly one unresolved state, naming none of the three causes", async () => {
    // `resolveOperator()` returns a bare `null` for no session, no link and an
    // inactive link alike, so the page cannot tell them apart and must not
    // appear to. One alert, one wording, no second variant.
    givenSignedInAs("stranger@oxfordlancers.local");
    vi.mocked(resolveOperator).mockResolvedValue(null);

    render(await DashboardPage());

    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent(UNRESOLVED_MESSAGE);
    // Nothing that would let the reader work out which cause applies to them.
    expect(alerts[0].textContent).not.toMatch(/deactivat|disabl|inactive|revok|unlink|not linked/i);
  });

  it("renders the identical unresolved state whichever cause produced it", async () => {
    // Two different signed-in accounts, both unresolved. The rendered operator
    // block must be byte-identical: any difference would be a disclosure.
    givenSignedInAs("unlinked@oxfordlancers.local");
    vi.mocked(resolveOperator).mockResolvedValue(null);
    const unlinked = render(await DashboardPage()).getAllByRole("alert")[0].outerHTML;

    givenSignedInAs("deactivated@oxfordlancers.local");
    vi.mocked(resolveOperator).mockResolvedValue(null);
    const deactivated = render(await DashboardPage()).getAllByRole("alert")[0].outerHTML;

    expect(deactivated).toBe(unlinked);
  });

  it("says so plainly when a resolved operator holds no current role", async () => {
    givenSignedInAs("test.user@oxfordlancers.local");
    vi.mocked(resolveOperator).mockResolvedValue({
      authUserId: "auth-user-id",
      personId: "person-id",
      displayName: "Unroled Person",
      roleCodes: [],
      isActive: true,
    });

    render(await DashboardPage());

    expect(screen.getByText("Unroled Person")).toBeInTheDocument();
    expect(screen.getByText(/holds no role that is currently in effect/i)).toBeInTheDocument();
    // An unroled operator is resolved, so this is NOT the unresolved state.
    // The distinction matters more since LAN-95: a seat that has not started
    // yet now leaves `roleCodes` empty, and that is this state, not that one.
    expect(screen.queryByText(UNRESOLVED_MESSAGE)).not.toBeInTheDocument();
  });

  it("still redirects an unauthenticated request to the login page", async () => {
    givenSignedInAs(null);
    vi.mocked(resolveOperator).mockResolvedValue(null);

    await expect(DashboardPage()).rejects.toThrow("REDIRECT:/login?redirectTo=/dashboard");
    // The operator lookup must not happen for a request that has no session.
    expect(resolveOperator).not.toHaveBeenCalled();
  });
});
