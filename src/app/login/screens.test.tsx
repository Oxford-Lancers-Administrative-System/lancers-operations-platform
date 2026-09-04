/**
 * UX-01, sign in to Lancers Operations — LAN-73's screen, completed by LAN-125.
 *
 * What is asserted is what the wireframe and the issue require to be *there*:
 * the club's own identity, the access note, both approved actions, the
 * provisioning statement, and no registration control anywhere. Presentation
 * beyond that is Brian's judgment, not a test's.
 *
 * The `redirectTo` assertions are the security half. A destination that
 * survives into the form's hidden field but not into the "Forgot password?"
 * link would strand an operator; one that survives when it should have been
 * dropped is an open redirect.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("./actions", () => ({ signIn: vi.fn(), signOut: vi.fn() }));

import LoginPage from "./page";
import { describeSignInDestinationContract } from "../sign-in-destination-contract";

type LoginSearchParams = Record<string, string | string[] | undefined>;

function renderLogin(params: LoginSearchParams = {}) {
  return LoginPage({
    searchParams: Promise.resolve(params),
  } as unknown as Parameters<typeof LoginPage>[0]);
}

async function show(params: LoginSearchParams = {}) {
  return render(await renderLogin(params));
}

describe("the page says whose it is, and what signing in does not buy", () => {
  it("names Oxford Lancers Operations", async () => {
    await show();

    expect(screen.getByRole("heading", { name: "Sign in to Lancers Operations" })).toBeVisible();
  });

  it("carries the approved access note", async () => {
    // `slice-ux.md` § 8 and UX-01: authentication is not authorization, and the
    // sign-in page is where an operator is told so before they are refused.
    await show();

    expect(screen.getByText(/authentication does not grant access by itself/i)).toBeVisible();
    expect(screen.getByText(/checked on every protected action/i)).toBeVisible();
  });

  it("states that accounts come from the club and registration does not exist", async () => {
    await show();

    expect(screen.getByText(/no public registration/i)).toBeVisible();
  });

  it("offers no way to create an account", async () => {
    // `enable_signup = false` is the control; this is the other half — an
    // application that renders a sign-up control against a server that refuses
    // it is a broken promise on the club's front door.
    const { container } = await show();

    expect(container.textContent).not.toMatch(/sign up|create an account|register now/i);
    expect(screen.queryByRole("link", { name: /sign up|register/i })).toBeNull();
  });
});

describe("both approved actions are present", () => {
  it("shows Sign in and Forgot password?, with the wireframe's labels", async () => {
    await show();

    expect(screen.getByRole("button", { name: "Sign in" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Forgot password?" })).toBeVisible();
  });

  it("asks for an email address and a password, and nothing else", async () => {
    await show();

    expect(screen.getByLabelText(/email address/i)).toBeRequired();
    expect(screen.getByLabelText(/^password/i)).toBeRequired();
    expect(screen.getByLabelText(/^password/i)).toHaveAttribute("type", "password");
  });
});

describeSignInDestinationContract("/login", show);

describe("the requested destination survives, or is replaced", () => {
  it("carries a safe path into both the form and the recovery link", async () => {
    const { container } = await show({ redirectTo: "/operate/events/8f2/attendance" });

    expect(container.querySelector('input[name="redirectTo"]')).toHaveValue(
      "/operate/events/8f2/attendance",
    );
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute(
      "href",
      "/forgot-password?redirectTo=%2Foperate%2Fevents%2F8f2%2Fattendance",
    );
  });

  it.each(["https://evil.example/steal", "//evil.example", "/\\evil.example", "operate"])(
    "replaces the attacker-controlled destination %s with /operate",
    async (candidate) => {
      const { container } = await show({ redirectTo: candidate });

      expect(container.querySelector('input[name="redirectTo"]')).toHaveValue("/operate");
      expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute(
        "href",
        "/forgot-password?redirectTo=%2Foperate",
      );
    },
  );

  it("defaults to the operator shell when nothing was requested", async () => {
    const { container } = await show();

    expect(container.querySelector('input[name="redirectTo"]')).toHaveValue("/operate");
  });
});

describe("returning from a completed password reset", () => {
  it("says the password changed, and identifies nobody", async () => {
    const { container } = await show({ reset: "1" });

    expect(screen.getByText(/your password has been changed/i)).toBeVisible();
    expect(container.textContent).not.toMatch(/@|token|recovery link/i);
  });

  it("says nothing of the sort on an ordinary visit", async () => {
    await show();

    expect(screen.queryByText(/your password has been changed/i)).toBeNull();
  });

  it("is not shown for any other value of the flag", async () => {
    await show({ reset: "true" });

    expect(screen.queryByText(/your password has been changed/i)).toBeNull();
  });
});
