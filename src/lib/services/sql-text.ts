/**
 * Text going into a `like` predicate.
 *
 * Written out twice before this module existed — once in `membership.ts` for
 * the roster search and once in `events.ts` for the events search — with the
 * same body and the same comment. Two copies of an escaping rule is one copy
 * too many: the failure mode is silent and only shows up on the input nobody
 * tries, where a member called "Ana_" matches every three-letter name because
 * `_` is a wildcard, not a character.
 */

/**
 * Escapes the two LIKE metacharacters, and the escape character itself.
 *
 * The backslash goes first in the character class deliberately — escaping `%`
 * and `_` by prefixing a backslash is useless if the backslash the caller
 * typed is not itself escaped.
 */
export function escapeLikePattern(value: string | null): string | null {
  return value === null ? null : value.replace(/([\\%_])/g, "\\$1");
}
