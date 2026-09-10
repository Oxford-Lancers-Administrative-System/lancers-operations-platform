/**
 * One rule for "this operator-entered text is a web address", and one copy of it.
 *
 * ## Why this is its own module
 *
 * LAN-284 published an online event's joining link. That single decision gave
 * the same operator-entered string three destinations that all treat it as a
 * *link* rather than as text: the `URL` property of the subscription feed
 * (`calendar-feed.ts`, emitted raw because RFC 5545 3.3.13 types it as a URI),
 * the `href` of the anchor on the fully public `/calendar/[id]` page, and the
 * value the write path stores in the first place (`event-input.ts`).
 *
 * The guard was first written for the feed alone. Finding F1 of the LAN-272
 * review found the second consumer with no guard at all: a `javascript:` value
 * typed into "Joining link" became an anchor on an unauthenticated page, and a
 * visitor who clicked it ran that script in the application's own origin, with
 * their operator session live in the same browser. Two copies of a rule is how
 * that happens, so there is now one, and everything that turns this field into
 * a link goes through it.
 *
 * ## The rule
 *
 *   * **No control characters, and no line break of any kind.** Load-bearing in
 *     the feed, where a newline in a raw value ends the content line early and
 *     lets whatever follows be parsed as its own iCalendar property. Refused
 *     everywhere else too, because a value that cannot be published safely in
 *     one place is not a value worth storing anywhere.
 *   * **`http` or `https` only, parsed rather than pattern-matched.** `new URL`
 *     decides what the scheme is; a regular expression only decides what it
 *     looks like. `javascript:`, `data:`, `vbscript:` and anything that is not
 *     an absolute URL at all fail the same way.
 *
 * A pure module on purpose: no database, no `server-only`, no framework. It is
 * reached from a client component's own validation through `event-input.ts`, so
 * anything heavier here would land in the browser bundle.
 */

/**
 * Any C0 control character, `DEL`, and therefore both line breaks.
 *
 * Written as a scan rather than a regular expression character class so the
 * bytes it refuses are named by their code points in the source, where a reader
 * can see them, instead of being invisible inside a literal.
 */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * The value if it is safe to publish as a link, or `null` if it is not.
 *
 * Trims first, so trailing whitespace an operator pasted is not what refuses an
 * otherwise good link, and returns the trimmed form: what is checked is exactly
 * what is emitted.
 */
export function safeUri(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (hasControlCharacter(trimmed)) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return trimmed;
}

/**
 * Whether a value the operator actually typed satisfies the rule.
 *
 * Distinct from {@link safeUri} because the two callers want different things
 * from the same check: a *reader* wants the value or nothing, and a *writer*
 * wants to know whether to put a sentence beside the field. An empty or absent
 * value is not unsafe, it is simply no link, so this answers `true` for it, and
 * "is a link allowed on this event at all" stays the separate rule it already
 * is.
 */
export function isSafeUri(value: string | null | undefined): boolean {
  if (value === null || value === undefined || value.trim() === "") return true;
  return safeUri(value) !== null;
}
