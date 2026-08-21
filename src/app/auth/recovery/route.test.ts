// @vitest-environment node
/**
 * The recovery callback — LAN-125, LAN-141.
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
 *
 * ## Why every request in this file arrives on `http://0.0.0.0:8080`
 *
 * LAN-141. The redirect was built on `request.nextUrl.origin`, which behind
 * Cloud Run is the container's own bind address rather than the host the person
 * is looking at. It was found on the invitation route, where Brian watched a
 * real operator's working link end at `ERR_CONNECTION_REFUSED`; recovery
 * carried the identical line, so recovery had never worked in production
 * either — `docs/deployment.md` recorded it as untested rather than as broken.
 *
 * The old tests could not see it: they asserted the destination's path, and its
 * origin against a request whose origin was already the public host. Every
 * request here now carries the proxy's shape, and the assertions are on the
 * absolute `Location`.
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
  return new NextRequest(new URL(`/auth/recovery${query}`, origin));
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
    const location = new URL(locationOf(response));

    expect(response.status).toBe(303);
    expect(location.pathname).toBe("/reset-password");
    expect(location.search).toBe("");
    expect(locationOf(response)).not.toContain(TOKEN);
  });
});

describe("the redirect goes to the host the person is on, not the container's own", () => {
  it("sends a proxied request to the configured application origin", async () => {
    // The defect, as an assertion. Removing the fix from `route.ts` fails
    // exactly here, with `http://0.0.0.0:8080/reset-password`.
    const response = await GET(requestFor(`?token_hash=${TOKEN}&type=recovery`));

    expect(locationOf(response)).toBe(`${PUBLIC_ORIGIN}/reset-password`);
    expect(locationOf(response)).not.toContain("0.0.0.0");
  });

  it("still ignores a request origin that claims to be the public host", async () => {
    // A `Host` header is whatever the caller wrote, and `APP_BASE_URL` outranks
    // it. This is the property the fix must not have traded away for a working
    // redirect.
    const response = await GET(
      requestFor(`?token_hash=${TOKEN}&type=recovery`, "https://evil.example"),
    );

    expect(locationOf(response)).toBe(`${PUBLIC_ORIGIN}/reset-password`);
  });

  it("works on a developer machine with nothing configured", async () => {
    vi.stubEnv("APP_BASE_URL", "");

    const response = await GET(
      requestFor(`?token_hash=${TOKEN}&type=recovery`, "http://localhost:3010"),
    );

    expect(locationOf(response)).toBe("http://localhost:3010/reset-password");
  });

  it("falls back to a relative destination rather than to an untrusted host", async () => {
    // No `APP_BASE_URL` and a non-loopback request. The session has already
    // been minted, so refusing to redirect would strand the person; a relative
    // `Location` carries no authority at all, so the browser resolves it
    // against the URL it actually asked for.
    vi.stubEnv("APP_BASE_URL", "");

    const response = await GET(
      requestFor(`?token_hash=${TOKEN}&type=recovery`, "https://evil.example"),
    );

    expect(response.status).toBe(303);
    expect(locationOf(response)).toBe("/reset-password");
    expect(locationOf(response)).not.toContain("evil.example");
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
    expect(locationOf(response)).toBe(`${PUBLIC_ORIGIN}/reset-password`);
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
    const location = new URL(locationOf(response));

    expect(location.origin).toBe(PUBLIC_ORIGIN);
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

  it("puts the token in no header at all, on any origin", async () => {
    for (const origin of [CONTAINER_ORIGIN, "http://localhost:3010", "https://evil.example"]) {
      const response = await GET(requestFor(`?token_hash=${TOKEN}&type=recovery`, origin));

      for (const [, value] of response.headers) expect(value).not.toContain(TOKEN);
    }
  });
});
