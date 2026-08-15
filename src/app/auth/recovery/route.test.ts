// @vitest-environment node
/**
 * The recovery callback — LAN-125.
 *
 * Two properties, and both matter more than they look:
 *
 *   * **One destination.** Whatever happens, the browser is sent to
 *     `/reset-password` and nowhere else. This route mints a session; a
 *     caller-supplied destination on it would be an open redirect with
 *     credentials attached.
 *
 *   * **The token does not survive the hop.** It is in the request URL and must
 *     not be in the response's `Location`, in a cookie, in a header or in a log
 *     line — the next page has a password field on it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyOtp = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { verifyOtp } }),
}));

import { NextRequest } from "next/server";
import { GET } from "./route";

const TOKEN = "9d1273d925d7a6064170239fe8e5eaa45af11aee3ce0b9181039c19b";
const ORIGIN = "https://lancers.example.org";

function requestFor(query: string): NextRequest {
  return new NextRequest(new URL(`/auth/recovery${query}`, ORIGIN));
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyOtp.mockResolvedValue({ data: { session: { access_token: "x" } }, error: null });
});

describe("a well-formed recovery link is exchanged", () => {
  it("presents the token to Supabase as a recovery token, and nothing else", async () => {
    await GET(requestFor(`?token_hash=${TOKEN}&type=recovery`));

    expect(verifyOtp).toHaveBeenCalledExactlyOnceWith({
      type: "recovery",
      token_hash: TOKEN,
    });
  });

  it("lands on the reset page with the token gone from the URL", async () => {
    const response = await GET(requestFor(`?token_hash=${TOKEN}&type=recovery`));
    const location = new URL(response.headers.get("location")!);

    expect(response.status).toBe(303);
    expect(location.pathname).toBe("/reset-password");
    expect(location.search).toBe("");
    expect(location.origin).toBe(ORIGIN);
    expect(response.headers.get("location")).not.toContain(TOKEN);
  });
});

describe("anything else is refused before the auth server is contacted", () => {
  it.each([
    ["no query at all", ""],
    ["no token", "?type=recovery"],
    ["no type", `?token_hash=${TOKEN}`],
    ["a signup link", `?token_hash=${TOKEN}&type=signup`],
    ["an email-change link", `?token_hash=${TOKEN}&type=email_change`],
    ["a PKCE code instead", "?code=e5b1c2d3-1111-2222-3333-444455556666"],
    ["a malformed token", "?token_hash=not-a-token&type=recovery"],
    ["an upper-case token", `?token_hash=${TOKEN.toUpperCase()}&type=recovery`],
    ["an injected token", "?token_hash=abc'+or+'1'%3D'1&type=recovery"],
  ])("refuses %s", async (_why, query) => {
    const response = await GET(requestFor(query));

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(new URL(response.headers.get("location")!).pathname).toBe("/reset-password");
  });
});

describe("a rejected exchange is indistinguishable from a successful one, here", () => {
  it("still redirects to the reset page, with no error in the URL", async () => {
    // The reset page renders its generic invalid-link screen because there is
    // no recovery session. Reporting the reason here would be a second, more
    // talkative copy of a message that is deliberately vague.
    verifyOtp.mockResolvedValue({
      data: { session: null },
      error: { message: "Email link is invalid or has expired" },
    });

    const response = await GET(requestFor(`?token_hash=${TOKEN}&type=recovery`));
    const location = new URL(response.headers.get("location")!);

    expect(location.pathname).toBe("/reset-password");
    expect(location.search).toBe("");
    expect(response.status).toBe(303);
  });
});

describe("the response keeps no trace and invites none", () => {
  it.each([
    ["cache-control", /no-store/],
    ["referrer-policy", /^no-referrer$/],
    ["x-robots-tag", /noindex/],
  ])("sets %s", async (header, expected) => {
    // `Referrer-Policy` is the one that matters most: the token is in *this*
    // request's URL, so without it the address of the next outbound request
    // would carry the token to a third party's access log.
    const response = await GET(requestFor(`?token_hash=${TOKEN}&type=recovery`));

    expect(response.headers.get(header)).toMatch(expected);
  });

  it("puts the token in no header at all", async () => {
    const response = await GET(requestFor(`?token_hash=${TOKEN}&type=recovery`));

    for (const [, value] of response.headers) expect(value).not.toContain(TOKEN);
  });
});
