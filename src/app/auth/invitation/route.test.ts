// @vitest-environment node
/**
 * The invitation callback — LAN-131, matrix row 23; LAN-141.
 *
 * The same two properties `/auth/recovery` is held to, and one more that is
 * specific to this route:
 *
 *   * **Two destinations, both of them this module's own.** An exchanged token
 *     lands on `/reset-password`; anything else lands on `/invitation-link`
 *     (LAN-311). Neither is caller-supplied: this route mints a session, and a
 *     destination read off the query string would be an open redirect with
 *     credentials attached.
 *
 *   * **The token does not survive the hop.** It is in the request URL and must
 *     not appear in `Location`, because the next page has a password field.
 *
 *   * **It exchanges an `invite` token and nothing else.** A recovery link, a
 *     signup link and an email-change link all arrive at this shape of URL, and
 *     presenting one of them here as an invitation would be asking the auth
 *     server a question about a token this route has no business consuming.
 *
 * ## Why every request in this file arrives on `http://0.0.0.0:8080`
 *
 * LAN-141, and it is not a stylistic choice. Brian invited a real operator in
 * production: the email was right, the link was right, and the token exchanged.
 * Then the browser was sent to `http://0.0.0.0:8080/reset-password` —
 * `ERR_CONNECTION_REFUSED` — because the redirect was built on
 * `request.nextUrl.origin`, which behind Cloud Run is the container's own bind
 * address rather than the host the operator is looking at.
 *
 * The reason it shipped is that the old tests asserted the destination's
 * *path* and its origin against a request whose origin was already the public
 * host, so the defect was invisible to them. Every request here now carries the
 * proxy's shape instead, and the assertions are on the absolute `Location`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const verifyOtp = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { verifyOtp } }),
}));

import { NextRequest } from "next/server";
import { GET } from "./route";

const TOKEN = "9d1273d925d7a6064170239fe8e5eaa45af11aee3ce0b9181039c19b";

/** What the operator typed, and what `APP_BASE_URL` is set to on the revision. */
const PUBLIC_ORIGIN = "https://lancers.example.org";

/** What the container sees. `.github/workflows/deploy.yml` binds 8080. */
const CONTAINER_ORIGIN = "http://0.0.0.0:8080";

function requestFor(query: string, origin: string = CONTAINER_ORIGIN): NextRequest {
  return new NextRequest(new URL(`/auth/invitation${query}`, origin));
}

function locationOf(response: Response): string {
  return response.headers.get("location")!;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("APP_BASE_URL", PUBLIC_ORIGIN);
  verifyOtp.mockResolvedValue({ data: { session: { access_token: "x" } }, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
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
    const location = new URL(locationOf(response));

    expect(response.status).toBe(303);
    expect(location.pathname).toBe("/reset-password");
    expect(location.search).toBe("");
    expect(locationOf(response)).not.toContain(TOKEN);
  });

  it("is not cached, not attributed and not indexed", async () => {
    const response = await GET(requestFor(`?token_hash=${TOKEN}&type=invite`));

    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
});

describe("the redirect goes to the host the operator is on, not the container's own", () => {
  it("sends a proxied request to the configured application origin", async () => {
    // The defect, as an assertion. Removing the fix from `route.ts` fails
    // exactly here, with `http://0.0.0.0:8080/reset-password`.
    const response = await GET(requestFor(`?token_hash=${TOKEN}&type=invite`));

    expect(locationOf(response)).toBe(`${PUBLIC_ORIGIN}/reset-password`);
    expect(locationOf(response)).not.toContain("0.0.0.0");
  });

  it("still ignores a request origin that claims to be the public host", async () => {
    // A `Host` header is whatever the caller wrote, and `APP_BASE_URL` outranks
    // it. This is the property the fix must not have traded away for a working
    // redirect.
    const response = await GET(
      requestFor(`?token_hash=${TOKEN}&type=invite`, "https://evil.example"),
    );

    expect(locationOf(response)).toBe(`${PUBLIC_ORIGIN}/reset-password`);
  });

  it("works on a developer machine with nothing configured", async () => {
    vi.stubEnv("APP_BASE_URL", "");

    const response = await GET(
      requestFor(`?token_hash=${TOKEN}&type=invite`, "http://localhost:3010"),
    );

    expect(locationOf(response)).toBe("http://localhost:3010/reset-password");
  });

  it("falls back to a relative destination rather than to an untrusted host", async () => {
    // No `APP_BASE_URL` and a non-loopback request. The session has already
    // been minted, so refusing to redirect would strand the operator; a
    // relative `Location` carries no authority at all, so the browser resolves
    // it against the URL it actually asked for.
    vi.stubEnv("APP_BASE_URL", "");

    const response = await GET(
      requestFor(`?token_hash=${TOKEN}&type=invite`, "https://evil.example"),
    );

    expect(response.status).toBe(303);
    expect(locationOf(response)).toBe("/reset-password");
    expect(locationOf(response)).not.toContain("evil.example");
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
  ])("%s never reaches Supabase, and lands on the invitation screen", async (_name, query) => {
    const response = await GET(requestFor(query));

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    // LAN-311: not `/reset-password`. Nothing was exchanged, so there is no
    // session for that screen to use, and the sentence it renders without one
    // is about a password reset this visitor never asked for.
    expect(locationOf(response)).toBe(`${PUBLIC_ORIGIN}/invitation-link`);
  });
});

describe("an invitation that cannot be exchanged — LAN-311", () => {
  /**
   * Clint's failure, as assertions. His token could not verify — LAN-309
   * decision 12 records why: the address already had an account — and the
   * screen he was handed told him his *password-reset* link was no longer
   * valid and to request a new one. He did, on an account that has never had a
   * password, and got the same error. This route is where that loop begins.
   *
   * Three shapes of "no", because only one of them is an `error`. `verifyOtp`
   * can answer without one and still mint no session, and it is the session,
   * not the absence of an error, that `/reset-password` needs.
   */
  const noSession = [
    [
      "a spent or expired token",
      { data: { session: null }, error: { message: "Email link is invalid or has expired" } },
    ],
    ["a token that exchanged into nothing", { data: { session: null }, error: null }],
    ["an auth server that answers with nothing at all", { data: null, error: null }],
  ] as const;

  it.each(noSession)(
    "%s lands on the invitation screen, not the password one",
    async (_n, answer) => {
      verifyOtp.mockResolvedValue(answer);

      const response = await GET(requestFor(`?token_hash=${TOKEN}&type=invite`));
      const location = new URL(locationOf(response));

      expect(response.status).toBe(303);
      expect(location.origin).toBe(PUBLIC_ORIGIN);
      expect(location.pathname).toBe("/invitation-link");
      // Still no error code, no reason, no query at all: expired, spent and
      // wrong-type share one screen and one sentence. Which journey the visitor
      // is on is not an account oracle; why their token failed would be.
      expect(location.search).toBe("");
    },
  );

  it("keeps the token out of the failure redirect too", async () => {
    verifyOtp.mockResolvedValue({ data: { session: null }, error: { message: "expired" } });

    const response = await GET(requestFor(`?token_hash=${TOKEN}&type=invite`));

    for (const [, value] of response.headers) expect(value).not.toContain(TOKEN);
  });

  it("falls back to a relative invitation screen rather than an untrusted host", async () => {
    vi.stubEnv("APP_BASE_URL", "");
    verifyOtp.mockResolvedValue({ data: { session: null }, error: { message: "expired" } });

    const response = await GET(
      requestFor(`?token_hash=${TOKEN}&type=invite`, "https://evil.example"),
    );

    expect(locationOf(response)).toBe("/invitation-link");
    expect(locationOf(response)).not.toContain("evil.example");
  });
});

describe("the response keeps no trace of the token", () => {
  it("puts the token in no header at all, on any origin", async () => {
    for (const origin of [CONTAINER_ORIGIN, "http://localhost:3010", "https://evil.example"]) {
      const response = await GET(requestFor(`?token_hash=${TOKEN}&type=invite`, origin));

      for (const [, value] of response.headers) expect(value).not.toContain(TOKEN);
    }
  });
});
