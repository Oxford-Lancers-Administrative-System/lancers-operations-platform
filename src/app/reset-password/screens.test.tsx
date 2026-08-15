/**
 * `/reset-password` — LAN-125.
 *
 * The page is a two-state machine and the states are the test: a session that
 * came from a recovery link gets the form, everything else gets one generic
 * screen. "Everything else" deliberately includes an ordinary signed-in
 * session, which is the case a reviewer should look for here, because that is
 * the one where failing open would be silent.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const getClaims = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getClaims } }),
}));

let actionState: unknown = { error: null };
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useActionState: () => [actionState, vi.fn(), false] };
});

vi.mock("./actions", () => ({ completePasswordReset: vi.fn() }));

import {
  INVALID_RECOVERY_LINK_MESSAGE,
  MINIMUM_PASSWORD_LENGTH,
  PASSWORD_MISMATCH_MESSAGE,
} from "@/lib/auth/recovery";
import ResetPasswordPage from "./page";
import ResetPasswordForm from "./reset-password-form";

type SearchParams = Record<string, string | string[] | undefined>;

async function showPage(params: SearchParams = {}) {
  return render(
    await ResetPasswordPage({
      searchParams: Promise.resolve(params),
    } as unknown as Parameters<typeof ResetPasswordPage>[0]),
  );
}

function givenSession(claims: unknown) {
  getClaims.mockResolvedValue({ data: claims === null ? null : { claims } });
}

beforeEach(() => {
  vi.clearAllMocks();
  actionState = { error: null };
  givenSession({ sub: "auth-user-id", amr: [{ method: "otp", timestamp: 1 }] });
});

describe("a recovery session gets the form", () => {
  it("asks for the new password twice", async () => {
    await showPage();

    expect(screen.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
    expect(screen.getByLabelText(/^new password/i)).toBeRequired();
    expect(screen.getByLabelText(/confirm new password/i)).toBeRequired();
    expect(screen.getByRole("button", { name: "Set new password" })).toBeVisible();
  });

  it("states the configured rule, taken from the same constant the server applies", async () => {
    await showPage();

    expect(
      screen.getByText(new RegExp(`at least ${MINIMUM_PASSWORD_LENGTH} characters`, "i")),
    ).toBeVisible();
  });

  it("gives the browser the same minimum the server enforces", async () => {
    await showPage();

    for (const field of screen.getAllByLabelText(/password/i)) {
      expect(field).toHaveAttribute("minlength", String(MINIMUM_PASSWORD_LENGTH));
      expect(field).toHaveAttribute("type", "password");
    }
  });

  it("warns that the session ends, so the sign-in prompt afterwards is not a surprise", async () => {
    await showPage();

    expect(screen.getByText(/signed out/i)).toBeVisible();
  });

  it("carries a safe destination and drops an unsafe one", async () => {
    const safe = await showPage({ redirectTo: "/operate/roster" });
    expect(safe.container.querySelector('input[name="redirectTo"]')).toHaveValue("/operate/roster");

    const unsafe = await showPage({ redirectTo: "https://evil.example" });
    expect(unsafe.container.querySelector('input[name="redirectTo"]')).toHaveValue("/operate");
  });
});

describe("everything else gets one generic screen", () => {
  it.each([
    ["an ordinary password session", { sub: "auth-user-id", amr: [{ method: "password" }] }],
    ["no session at all", null],
    ["claims with no amr", { sub: "auth-user-id" }],
    ["an empty amr", { sub: "auth-user-id", amr: [] }],
  ])("refuses %s", async (_why, claims) => {
    givenSession(claims);

    const { container } = await showPage();

    expect(screen.getByRole("heading", { name: "This reset link cannot be used" })).toBeVisible();
    expect(screen.getByText(INVALID_RECOVERY_LINK_MESSAGE)).toBeVisible();
    expect(container.querySelector('input[type="password"]')).toBeNull();
  });

  it("routes back to asking for a new link", async () => {
    givenSession(null);

    await showPage();

    expect(screen.getByRole("link", { name: "Request a new link" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  it("names no user, account, provider or reason", async () => {
    // A missing link, a spent one, an expired one and a wrong-type one all
    // arrive here identically, and the screen must not start distinguishing
    // them by accident.
    givenSession(null);

    const { container } = await showPage();

    expect(container.textContent).not.toMatch(/@|supabase|token|otp|expired at|user/i);
  });
});

describe("the form's own failure states", () => {
  it("shows a policy or mismatch failure without clearing the screen", () => {
    actionState = { error: PASSWORD_MISMATCH_MESSAGE };

    render(<ResetPasswordForm redirectTo="/operate" />);

    expect(screen.getByText(PASSWORD_MISMATCH_MESSAGE)).toBeVisible();
    expect(screen.getByLabelText(/^new password/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Set new password" })).toBeVisible();
  });

  it("swaps to the invalid-link screen when the recovery context has gone", () => {
    // The action re-checks on submit. If the session went away between render
    // and post, the form must stop offering to save rather than fail silently.
    actionState = { error: INVALID_RECOVERY_LINK_MESSAGE, expired: true };

    render(<ResetPasswordForm redirectTo="/operate" />);

    expect(screen.getByText(INVALID_RECOVERY_LINK_MESSAGE)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Set new password" })).toBeNull();
    expect(screen.getByRole("link", { name: "Request a new link" })).toBeVisible();
  });

  it("never renders a password value into the markup", () => {
    actionState = { error: PASSWORD_MISMATCH_MESSAGE };

    const { container } = render(<ResetPasswordForm redirectTo="/operate" />);

    for (const field of container.querySelectorAll('input[type="password"]')) {
      expect(field.getAttribute("value")).toBeNull();
    }
  });
});
