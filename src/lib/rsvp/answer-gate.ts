/**
 * The GET/POST cookie gate for `/a/[token]` — mission decision Q-11.
 *
 * `src/proxy.ts` sets this cookie on every GET to `/a/[token]`, scoped by
 * `Path` to that exact pathname (never any other token's), and
 * `src/app/a/[token]/actions.ts` checks for it before accepting the POST that
 * records a response. Neither file may know the other's string by heart — a
 * typo in one place and a match in the other would silently reopen the gate —
 * so the name lives here, once, shared by both.
 *
 * ## Why presence is enough, and no value needs checking
 *
 * The `Path` attribute on a cookie set by the browser is a instruction to the
 * browser about which request paths carry it back, not a value the server
 * reads — so the guarantee "this cookie only returns on a request to this
 * exact token's URL" comes from `Path`, not from what the cookie's value says.
 * A GET to token A cannot leave a cookie a POST to token B would ever see. The
 * value therefore carries no secret and needs no comparison; its only job is
 * to exist.
 *
 * This is deliberately not a general-purpose CSRF token: it defeats an
 * automated visitor that issues a GET and never a POST — a link preview, a
 * security scanner, Meta's own click-tracking hop — not a browser that a
 * player is actively using to submit the one form the page shows.
 */
export const ANSWER_GATE_COOKIE = "lo_pa_gate";

/** How long the gate stays open after the GET that set it. Generous for a slow reader. */
export const ANSWER_GATE_MAX_AGE_SECONDS = 30 * 60;
