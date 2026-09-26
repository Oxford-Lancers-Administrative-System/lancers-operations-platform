/**
 * `/auth/invitation` on GET — LAN-441.
 *
 * The emailed link's GET renders one button and exchanges nothing, so an email
 * security scanner that pre-opens the link cannot spend the one-time token.
 * The last block walks the whole journey: the GET, then the button's POST to
 * `./exchange/route.ts`, which is the first and only call to `verifyOtp`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { verifyOtp, createClient } = vi.hoisted(() => {
  const verifyOtp = vi.fn();
  return { verifyOtp, createClient: vi.fn(async () => ({ auth: { verifyOtp } })) };
});
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import { NextRequest } from "next/server";
import Page from "./page";
import { POST } from "./exchange/route";

const TOKEN = "9d1273d925d7a6064170239fe8e5eaa45af11aee3ce0b9181039c19b";
const PUBLIC_ORIGIN = "https://lancers.example.org";

async function open(query: Record<string, string | string[]>) {
  return render(
    await Page({ searchParams: Promise.resolve(query), params: Promise.resolve({}) } as never),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_BASE_URL", PUBLIC_ORIGIN);
  verifyOtp.mockResolvedValue({ data: { session: { access_token: "x" } }, error: null });
});

describe("a well-formed link renders one button and spends nothing", () => {
  it("shows the button and never creates a Supabase client", async () => {
    await open({ token_hash: TOKEN, type: "invite" });

    expect(screen.getByRole("button", { name: "Set up your account" })).toBeVisible();
    expect(createClient).not.toHaveBeenCalled();
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("posts the token in hidden fields to the exchange route", async () => {
    await open({ token_hash: TOKEN, type: "invite" });

    const form = screen.getByTestId("invitation-confirm") as HTMLFormElement;
    expect(form.getAttribute("method")).toBe("post");
    expect(form.getAttribute("action")).toBe("/auth/invitation/exchange");
    expect(Object.fromEntries(new FormData(form))).toEqual({ token_hash: TOKEN, type: "invite" });
  });

  it("opening the page twice still spends nothing", async () => {
    await open({ token_hash: TOKEN, type: "invite" });
    await open({ token_hash: TOKEN, type: "invite" });

    expect(verifyOtp).not.toHaveBeenCalled();
  });
});

describe("anything else goes to /invitation-link without contacting the auth server", () => {
  it.each([
    ["no query at all", {}],
    ["no token", { type: "invite" }],
    ["no type", { token_hash: TOKEN }],
    ["the wrong type", { token_hash: TOKEN, type: "recovery" }],
    ["a malformed token", { token_hash: "not-a-token", type: "invite" }],
    ["a repeated token", { token_hash: [TOKEN, TOKEN], type: "invite" }],
    ["an injected token", { token_hash: "abc' or '1'='1", type: "invite" }],
  ])("%s", async (_name, query) => {
    await expect(open(query)).rejects.toThrow("REDIRECT:/invitation-link");
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});

describe("a scanner's GET, then the person's click", () => {
  it("leaves the token for the POST, which exchanges it and lands on /reset-password", async () => {
    // The scanner.
    await open({ token_hash: TOKEN, type: "invite" });
    expect(verifyOtp).not.toHaveBeenCalled();

    // The person, submitting the form the page rendered.
    const form = screen.getAllByTestId("invitation-confirm")[0] as HTMLFormElement;
    const body = new URLSearchParams(
      [...new FormData(form)].map(([key, value]) => [key, String(value)]),
    );
    const response = await POST(
      new NextRequest(new URL("/auth/invitation/exchange", "http://0.0.0.0:8080"), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      }),
    );

    expect(verifyOtp).toHaveBeenCalledExactlyOnceWith({ type: "invite", token_hash: TOKEN });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${PUBLIC_ORIGIN}/reset-password`);
  });
});
