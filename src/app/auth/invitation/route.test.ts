// @vitest-environment node
/**
 * The invitation callback — LAN-131, matrix row 23.
 *
 * The same two properties `/auth/recovery` is held to, and one more that is
 * specific to this route:
 *
 *   * **One destination.** Whatever happened, the browser is sent to
 *     `/reset-password`. This route mints a session; a caller-supplied
 *     destination on it would be an open redirect with credentials attached.
 *
 *   * **The token does not survive the hop.** It is in the request URL and must
 *     not appear in `Location`, because the next page has a password field.
 *
 *   * **It exchanges an `invite` token and nothing else.** A recovery link, a
 *     signup link and an email-change link all arrive at this shape of URL, and
 *     presenting one of them here as an invitation would be asking the auth
 *     server a question about a token this route has no business consuming.
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
  return new NextRequest(new URL(`/auth/invitation${query}`, ORIGIN));
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyOtp.mockResolvedValue({ data: { session: { access_token: "x" } }, error: null });
});

describe("a well-formed invitation link is exchanged", () => {
  it("presents the token to Supabase as an invite token, and nothing else", async () => {
    await GET(requestFor(`?token_hash=${TOKEN}&type=invite`));

    expect(verifyOtp).toHaveBeenCalledExactlyOnceWith({
      type: "invite",
      token_hash: TOKEN,
    });
  });

  it("lands on the password screen with the token gone from the URL", async () => {
    const response = await GET(requestFor(`?token_hash=${TOKEN}&type=invite`));
    const location = new URL(response.headers.get("location")!);

    expect(response.status).toBe(303);
    expect(location.pathname).toBe("/reset-password");
    expect(location.search).toBe("");
    expect(location.origin).toBe(ORIGIN);
    expect(response.headers.get("location")).not.toContain(TOKEN);
  });

  it("is not cached, not attributed and not indexed", async () => {
    const response = await GET(requestFor(`?token_hash=${TOKEN}&type=invite`));

    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
});

describe("anything else is refused before the auth server is contacted", () => {
  it.each([
    ["no query at all", ""],
    ["no token", "?type=invite"],
    ["no type", `?token_hash=${TOKEN}`],
    ["a recovery link", `?token_hash=${TOKEN}&type=recovery`],
    ["a signup link", `?token_hash=${TOKEN}&type=signup`],
    ["an email-change link", `?token_hash=${TOKEN}&type=email_change`],
    ["a PKCE code instead", "?code=e5b1c2d3-1111-2222-3333-444455556666"],
    ["a malformed token", "?token_hash=not-a-token&type=invite"],
    ["an upper-case token", `?token_hash=${TOKEN.toUpperCase()}&type=invite`],
    ["an injected token", "?token_hash=abc'+or+'1'%3D'1&type=invite"],
  ])("%s never reaches Supabase, and still lands on the password screen", async (_name, query) => {
    const response = await GET(requestFor(query));

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/reset-password");
  });
});

describe("a spent or expired invitation is indistinguishable from a good one", () => {
  it("lands in the same place, saying nothing about why", async () => {
    verifyOtp.mockResolvedValue({
      data: { session: null },
      error: { message: "Email link is invalid or has expired" },
    });

    const response = await GET(requestFor(`?token_hash=${TOKEN}&type=invite`));
    const location = new URL(response.headers.get("location")!);

    // No error code, no reason, no query at all. "This invitation was already
    // used" is an account oracle, and the destination renders its own generic
    // message for a request that arrives with no session.
    expect(response.status).toBe(303);
    expect(location.pathname).toBe("/reset-password");
    expect(location.search).toBe("");
  });
});
