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

/**
 * How a Person's name is rendered in SQL, for the queries that select one.
 *
 * The same three rules everywhere, because getting any of them wrong is
 * visible to the club rather than to a test: a preferred name wins over the
 * given name, a blank preferred name is not a preferred name, and
 * `people.family_name` is nullable by design — a quarter of the club's real
 * records are first-name-only, and `'Ana' || ' ' || null` is `null`, which is
 * how a first-name-only member becomes "Unnamed participant" on screen.
 *
 * `alias` is a table alias the caller controls; it is never user input.
 */
export function personDisplayNameSql(alias: string): string {
  return `case
            when ${alias}.id is null then null
            when ${alias}.family_name is null
              then coalesce(nullif(btrim(${alias}.known_as), ''), ${alias}.given_name)
            else coalesce(nullif(btrim(${alias}.known_as), ''), ${alias}.given_name)
                 || ' ' || ${alias}.family_name
          end`;
}
