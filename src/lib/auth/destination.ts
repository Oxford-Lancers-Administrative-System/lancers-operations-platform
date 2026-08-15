/**
 * Where an authentication journey is allowed to send a browser next.
 *
 * The rule is one sentence: a **same-origin relative path, or nothing**. It was
 * written inline in `src/app/login/page.tsx` and again in
 * `src/app/login/actions.ts`, and LAN-125 adds three more places that need it —
 * the forgot-password page's return link, its action, and the reset-password
 * screen. Five copies of a security rule is five chances for one of them to be
 * the lenient copy, so it lives here now and is asserted once.
 *
 * ## What is refused, and why each refusal is separate
 *
 *   * **An absolute URL** (`https://evil.example/x`) — the obvious open
 *     redirect. A freshly authenticated operator must not be bounced off this
 *     origin.
 *
 *   * **A protocol-relative URL** (`//evil.example`) — reads as a path, is not
 *     one. `new URL("//evil.example", origin)` resolves to a foreign host.
 *
 *   * **A backslash-prefixed path** (`/\evil.example`, `/\/evil.example`) —
 *     this is the one the original two-character check missed. WHATWG URL
 *     parsing treats `\` as `/` in the authority position, so browsers
 *     normalise `/\evil.example` to `//evil.example` and follow it off-origin.
 *     Node's `URL` does the same; a test in this module's suite proves it
 *     rather than asserting it from memory.
 *
 *   * **Control characters, including a bare newline or tab** — a value
 *     carrying `\n` can split a `Location` header in a proxy that is less
 *     careful than Next.js, and `\t` and friends are stripped by browsers
 *     during URL parsing, which turns `/\tevil.example` back into something
 *     off-origin.
 *
 * Everything refused resolves to `DEFAULT_DESTINATION`, never to an error: a
 * crafted `redirectTo` is a link somebody was sent, and the person clicking it
 * should land on the operator shell, not on a diagnostic.
 */

/** Where a signed-in operator belongs when no safe destination was requested. */
export const DEFAULT_DESTINATION = "/operate";

/** Rejects anything a browser might read as an authority component. */
function startsAnAuthority(character: string): boolean {
  return character === "/" || character === "\\";
}

/**
 * The single same-origin relative-path rule.
 *
 * Accepts the `string | string[] | undefined` shape Next.js hands a page from
 * `searchParams`, and the `FormDataEntryValue | null` shape an action reads,
 * so no caller has to normalise before asking.
 */
export function safeRelativeDestination(
  value: unknown,
  fallback: string = DEFAULT_DESTINATION,
): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== "string") return fallback;
  if (candidate.length === 0 || candidate.length > 512) return fallback;

  // Control characters, refused deliberately — see the note above.
  if (/[\u0000-\u001f\u007f]/.test(candidate)) return fallback;
  if (!candidate.startsWith("/")) return fallback;
  if (startsAnAuthority(candidate[1] ?? "")) return fallback;

  return candidate;
}
