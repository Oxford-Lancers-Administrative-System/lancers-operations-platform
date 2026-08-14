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
 * The same floor, for a path that cannot be expressed as "wrap this work".
 *
 * A Server Action performs its refusal by throwing a redirect, so it cannot be
 * wrapped the way the page's read is. It gets the clock and the hold as two
 * calls instead. Both live here rather than at the call site because reading
 * the clock is impure, and this module is where that is allowed.
 */
export function startUniformClock(): number {
  return Date.now();
}

export async function holdUniformRefusal(startedAt: number): Promise<void> {
  const remaining = UNIFORM_TERMINAL_RESPONSE_MS - (Date.now() - startedAt);
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

/**
 * Two buckets, and the reason there are two.
 *
 * The first version counted every request against the caller's IP address
 * alone, at thirty a minute. Independent review showed what that does in the
 * deployment this is actually for. Answering costs three requests (render,
 * post, confirm) and declining costs four, LAN-78 delivers to the whole squad
 * at once, and UK mobile carriers put thousands of subscribers behind a single
 * public address — so eight or ten players answering in the same minute from
 * one carrier could exhaust the allowance for everybody behind it. They would
 * then be told their link could not be used, ask for a new one, and supersede
 * the working link they already had.
 *
 * So the per-link bucket is now the one a player can hit, and it is keyed on
 * the token: one person hammering their own link is bounded without touching
 * anybody else's. The per-address bucket remains as a volumetric backstop
 * against a scanner, and is set far above what any real group of players
 * generates.
 *
 * Both are checked before the database is touched, which is the other thing a
 * limiter on this route is for.
 */
export const RATE_LIMIT_MAX_PER_LINK = 20;
export const RATE_LIMIT_MAX_PER_ADDRESS = 300;
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

/** Bounds the map so a spray of distinct keys cannot grow it forever. */
const MAX_TRACKED_CLIENTS = 10_000;

/** How far back an eviction trims, so the next one is thousands away. */
const EVICT_DOWN_TO = 7_500;

/**
 * Reclaims memory, and only when there is memory to reclaim.
 *
 * The first version swept the whole map on every single request. That is
 * correct and quietly quadratic: independent review noted that at the cap every
 * request pays a ten-thousand-entry scan, and writing a test for the eviction
 * branch made it visible immediately — twelve thousand synthetic clients took
 * three seconds, and the sweep was all of it.
 *
 * Nothing depends on the sweep for correctness. `consume` already treats an
 * expired window as a fresh one, so an entry left lying about is invisible to
 * every caller; the sweep exists to stop the map growing without bound. So it
 * runs only when the map is actually over its bound, which on any real traffic
 * is never.
 */
function prune(now: number): void {
  if (windows.size <= MAX_TRACKED_CLIENTS) return;

  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
  if (windows.size <= MAX_TRACKED_CLIENTS) return;

  // Still oversized with nothing expired: drop the oldest windows. Losing a
  // live counter is the safe direction — it hands a client some of their
  // allowance back, and never blocks a legitimate player permanently.
  //
  // Down to a low-water mark rather than exactly to the cap. Trimming to the
  // cap leaves the very next request over it again, so every subsequent
  // request pays a full sort — the quadratic cost simply moves. Leaving
  // headroom means the sort runs once per few thousand requests instead.
  const ordered = [...windows.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
  for (const [key] of ordered.slice(0, windows.size - EVICT_DOWN_TO)) {
    windows.delete(key);
  }
}

function consume(key: string, allowance: number, now: number): boolean {
  const existing = windows.get(key);
  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  existing.count += 1;
  return existing.count <= allowance;
}

/** Why a request was refused, for the log and for the caller's message. */
export type ThrottleReason = "link" | "address";

export interface RsvpRequestDecision {
  readonly allowed: boolean;
  readonly reason: ThrottleReason | null;
}

/**
 * Records one request and says whether to serve it.
 *
 * The *public* refusal is deliberately the same terminal response every other
 * unusable link produces — a distinct "too many requests" page would tell a
 * scanner it was being counted and give it something to pace against. But that
 * uniformity is exactly what makes throttling invisible when it happens to a
 * real player, so the reason comes back to the caller, which logs it. The
 * player sees nothing different; the club can find out.
 */
export function allowRsvpRequest(
  address: string,
  token: string,
  now: number = Date.now(),
): RsvpRequestDecision {
  prune(now);

  // The link first: it is the bucket a real person can reach, and keeping it
  // per-token means one player's reloading cannot spend another player's
  // allowance even when a carrier puts them behind one address.
  if (!consume(`link:${token}`, RATE_LIMIT_MAX_PER_LINK, now)) {
    return { allowed: false, reason: "link" };
  }
  if (!consume(`addr:${address}`, RATE_LIMIT_MAX_PER_ADDRESS, now)) {
    return { allowed: false, reason: "address" };
  }
  return { allowed: true, reason: null };
}

/**
 * Says, once, that a request was throttled.
 *
 * The whole point of the uniform public response is that a throttled player
 * cannot tell they were throttled — which also means nobody can, unless the
 * server says so. Independent review found that if this fired during the pilot
 * nothing in the system would record it. No token and no address is logged: the
 * token is a secret, and an address is personal data this application has no
 * reason to keep.
 */
export function logThrottledRsvpRequest(reason: ThrottleReason): void {
  console.warn(
    `[rsvp] a request was refused by the ${reason} rate limit. ` +
      "If players report that a valid link will not load, this is the first thing to check.",
  );
}

/** Test seam. Never called by the application. */
export function resetRsvpRateLimit(): void {
  windows.clear();
}

/**
 * Which address to count a request against.
 *
 * Reads the **last** `x-forwarded-for` hop. Under the model where the platform
 * appends the real peer, that entry is the one a caller cannot choose, and
 * reading the first would let anybody pick their own bucket with a header.
 *
 * This is an assumption about a platform, not a fact this repository can check,
 * and independent review was right to press on it: if Google's frontend instead
 * leaves its own address last, every request collapses into one key. That is
 * survivable here only because the per-address bucket is a backstop rather than
 * the limit a player meets — the per-link bucket does that work, and it does
 * not depend on addresses at all. It is listed in the pull request as something
 * to confirm against a deployed revision before the pilot.
 *
 * With no header — a direct connection in local development — every caller
 * shares one bucket, which can only limit more than intended, never less.
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
