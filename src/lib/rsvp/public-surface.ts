import "server-only";

/**
 * Two protections the public RSVP page needs and nothing else in the
 * application does: a rate limit, and a uniform response time. LAN-79.
 *
 * `/rsvp/[token]` is the only route an unauthenticated stranger is meant to
 * reach and act on. Everything else either refuses anonymous callers outright
 * or, in the webhook's case, authenticates them with an HMAC. Here the token
 * *is* the authorization, which makes the route the one place in the codebase
 * where guessing is a plausible attack and where the *shape* of a refusal is
 * itself information.
 */

/**
 * The floor every terminal response waits for, in milliseconds.
 *
 * Brian's 12 August decision requires unknown, expired and revoked links to be
 * publicly indistinguishable, and lists "non-distinguishable timing behavior"
 * alongside the copy and the status code. Those three states cost genuinely
 * different work: an unknown token that fails the format check never reaches
 * the database at all, while a revoked one costs a round trip and a join across
 * three tables. Left alone, the difference is measurable from outside and tells
 * a holder which kind of failure they have — which is exactly what the decision
 * forbids.
 *
 * So every terminal response is held until the same deadline. The floor is
 * above the slow path rather than near it, because padding only works when the
 * work reliably finishes first.
 *
 * This equalises the *terminal* states against each other. It deliberately does
 * not try to make a valid link indistinguishable from an invalid one — those
 * differ in their entire visible content, and pretending otherwise would be
 * security theatre with a latency cost.
 */
export const UNIFORM_TERMINAL_RESPONSE_MS = 250;

/**
 * Runs `work`, and holds a terminal outcome until the floor has elapsed.
 *
 * The clock is read here rather than by the caller for a mundane reason: the
 * caller is a Server Component, and `Date.now()` in a render body is an impure
 * call the lint rules reject. Keeping the measurement inside this module is
 * both the honest home for it and the version that passes.
 *
 * Only terminal outcomes are padded. A valid link differs from an invalid one
 * in its entire visible content, so equalising those two would cost every
 * player a quarter of a second to hide nothing.
 */
export async function withUniformTerminalTiming<T>(
  work: () => Promise<T>,
  isTerminal: (result: T) => boolean,
): Promise<T> {
  const startedAt = Date.now();
  const result = await work();
  if (!isTerminal(result)) return result;

  const remaining = UNIFORM_TERMINAL_RESPONSE_MS - (Date.now() - startedAt);
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
  return result;
}

/**
 * Requests allowed from one client per window, and the window.
 *
 * Sized for a person, not for a scanner. A player opening their link, changing
 * their mind twice and reloading is nowhere near thirty requests a minute; an
 * attacker walking the 256-bit token space is stopped by arithmetic long before
 * this matters, so the limit exists for the crude case — a script hammering one
 * host — and for keeping the database out of it.
 */
export const RATE_LIMIT_MAX_REQUESTS = 30;
export const RATE_LIMIT_WINDOW_MS = 60_000;

interface Window {
  count: number;
  resetAt: number;
}

/**
 * Per-process, in memory, and honest about it.
 *
 * Cloud Run runs more than one instance under load, so the effective limit is
 * this number multiplied by the instance count, and an instance restart forgets
 * everything. A shared counter would need Redis or a database round trip on the
 * one path that must stay cheap under exactly the traffic a limiter is for.
 *
 * That trade is deliberate and is recorded in the pull request rather than
 * hidden here: this is a brake on crude abuse, not a quota system.
 */
const windows = new Map<string, Window>();

/** Bounds the map so a spray of distinct client keys cannot grow it forever. */
const MAX_TRACKED_CLIENTS = 10_000;

function prune(now: number): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
  if (windows.size <= MAX_TRACKED_CLIENTS) return;
  // Still oversized after pruning expired entries: drop the oldest windows.
  // Losing a live counter is the safe direction — it costs a client some of
  // their allowance back, and never blocks a legitimate player permanently.
  const ordered = [...windows.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
  for (const [key] of ordered.slice(0, windows.size - MAX_TRACKED_CLIENTS)) {
    windows.delete(key);
  }
}

/**
 * Records one request against `client` and says whether to serve it.
 *
 * A refusal is rendered as the same terminal response every other unusable link
 * produces. That is not laziness: a distinct "too many requests" page would
 * tell a scanner that its requests were being counted, and would give it a
 * signal to pace against. From outside, a throttled request and a bad token are
 * the same event.
 */
export function allowRsvpRequest(client: string, now: number = Date.now()): boolean {
  prune(now);

  const existing = windows.get(client);
  if (!existing || existing.resetAt <= now) {
    windows.set(client, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  existing.count += 1;
  return existing.count <= RATE_LIMIT_MAX_REQUESTS;
}

/** Test seam. Never called by the application. */
export function resetRsvpRateLimit(): void {
  windows.clear();
}

/**
 * Who to count a request against.
 *
 * `x-forwarded-for` is spoofable in general, but this application only ever
 * runs behind Cloud Run's load balancer, which overwrites the header with the
 * real peer address appended last. Reading the *last* entry is therefore the
 * trustworthy one; reading the first would let a caller choose their own bucket
 * by sending a header.
 *
 * With no header at all — a direct connection in local development — every
 * caller shares one bucket. That is the conservative direction: it can only
 * limit more than intended, never less.
 */
export function clientKeyFrom(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((hop) => hop.trim())
      .filter((hop) => hop !== "");
    if (hops.length > 0) return hops[hops.length - 1];
  }
  return "unattributed";
}
