/**
 * `/forgot-password` — LAN-125.
 *
 * The rendered half of the enumeration defence. The action's half is in
 * `actions.test.ts`; this asserts that what an operator sees after submitting
 * is one confirmation with one message, that it refers to no account, and that
 * the page offers nothing else to learn from.
 *
 * `useActionState` is stubbed rather than driven through a submission: the
 * action has its own suite against a mocked Supabase, and what this file is
 * about is what gets drawn for each state it can return.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

let actionState: unknown = { status: "idle" };

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useActionState: () => [actionState, vi.fn(), false] };
});

vi.mock("./actions", () => ({ requestPasswordReset: vi.fn() }));

import { PUBLIC_RECOVERY_CONFIRMATION } from "@/lib/auth/recovery";
import ForgotPasswordPage from "./page";
import ForgotPasswordForm from "./forgot-password-form";

type SearchParams = Record<string, string | string[] | undefined>;

async function showPage(params: SearchParams = {}) {
  return render(
    await ForgotPasswordPage({
      searchParams: Promise.resolve(params),
    } as unknown as Parameters<typeof ForgotPasswordPage>[0]),
  );
}

function showForm(state: unknown, signInHref = "/login?redirectTo=%2Foperate") {
  actionState = state;
  return render(<ForgotPasswordForm signInHref={signInHref} />);
}

beforeEach(() => {
  actionState = { status: "idle" };
});

describe("the request screen", () => {
  it("asks for one address and offers a way back", async () => {
    await showPage();

    expect(screen.getByRole("heading", { name: "Reset your password" })).toBeVisible();
    expect(screen.getByLabelText(/email address/i)).toBeRequired();
    expect(screen.getByRole("button", { name: "Send reset instructions" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to sign in" })).toBeVisible();
  });

  it("keeps a safe destination on the way back to sign in", async () => {
    await showPage({ redirectTo: "/operate/roster" });

    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute(
      "href",
      "/login?redirectTo=%2Foperate%2Froster",
    );
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example"])(
    "drops the unsafe destination %s",
    async (candidate) => {
      await showPage({ redirectTo: candidate });

      expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute(
        "href",
        "/login?redirectTo=%2Foperate",
      );
    },
  );

  it("asks for nothing but an address", async () => {
    // No username, no "do you have an account?", nothing that could suggest the
    // answer depends on anything but the address.
    const { container } = await showPage();

    expect(container.querySelectorAll("input:not([type='hidden'])")).toHaveLength(1);
  });
});

describe("the confirmation is one confirmation", () => {
  it("replaces the form entirely, and offers no resend", () => {
    // The resend button is absent on purpose: it is the control that would make
    // the per-address frequency limit easy to probe from the page itself.
    showForm({ status: "confirmed", message: PUBLIC_RECOVERY_CONFIRMATION });

    expect(screen.getByText(PUBLIC_RECOVERY_CONFIRMATION)).toBeVisible();
    expect(screen.queryByLabelText(/email address/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /send|resend|try again/i })).toBeNull();
  });

  it("says nothing about the account, the address or the email having been sent", () => {
    const { container } = showForm({
      status: "confirmed",
      message: PUBLIC_RECOVERY_CONFIRMATION,
    });

    expect(container.textContent).toMatch(/if an account exists/i);
    expect(container.textContent).not.toMatch(/@|\bwe sent\b|\bno account\b|\bnot found\b/i);
  });

  it("still offers a safe way back to sign in", () => {
    showForm({ status: "confirmed", message: PUBLIC_RECOVERY_CONFIRMATION });

    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute(
      "href",
      "/login?redirectTo=%2Foperate",
    );
  });
});

describe("ordinary field validation stays ordinary", () => {
  it("keeps the form, marks the field, and mentions no account", () => {
    const { container } = showForm({
      status: "invalid",
      error: "Enter an email address, for example name@example.com.",
    });

    expect(screen.getByLabelText(/email address/i)).toBeVisible();
    expect(container.textContent).toMatch(/enter an email address/i);
    expect(container.textContent).not.toMatch(/account|registered|unknown|exists/i);
  });

  it("does not look like the confirmation", () => {
    // A validation failure and a successful request must not be confusable, in
    // either direction: one is about the typing, the other about nothing.
    const { container } = showForm({ status: "invalid", error: "Enter an email address." });

    expect(container.textContent).not.toMatch(/if an account exists/i);
  });
});
