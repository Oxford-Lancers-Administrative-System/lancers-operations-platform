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
 * The one alias a person is displayed under, or null.
 *
 * LAN-182 struck `people.known_as` and collapsed it into `person_aliases`, where
 * a single row may be flagged `is_display_name`. This is a correlated scalar
 * subquery rather than a join on purpose: it drops into an existing select list
 * without disturbing the query's shape, and every caller of the old column was
 * already selecting from `people`.
 *
 * `person_aliases_one_display_name_per_person` makes the `limit 1` a formality
 * rather than a tie-break — the database permits exactly one.
 *
 * `alias` is a table alias the caller controls; it is never user input.
 */
export function personDisplayAliasSql(alias: string): string {
  return `(select da.alias
             from public.person_aliases da
            where da.person_id = ${alias}.id and da.is_display_name
            limit 1)`;
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
              then coalesce(nullif(btrim(${personDisplayAliasSql(alias)}), ''), ${alias}.given_name)
            else coalesce(nullif(btrim(${personDisplayAliasSql(alias)}), ''), ${alias}.given_name)
                 || ' ' || ${alias}.family_name
          end`;
}
