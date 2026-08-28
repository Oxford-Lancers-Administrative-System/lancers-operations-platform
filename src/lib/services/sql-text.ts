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
 * The six-rung status ladder an operator sees, in SQL — LAN-183,
 * `REQ-status-ladder`. `Recruit` from `recruitment_prospects` when a person
 * holds no membership, one of the five stored `membership_status` values from
 * their most recent membership otherwise, or `null` for a person on neither
 * record (a coach or committee member holding no season tie at all —
 * `REQ-create-without-roles`).
 *
 * "Most recent" is the membership whose season started latest, tie-broken by
 * the membership row's own `created_at`. The person record is season-agnostic
 * (`DEC-w1-01`) and nothing in this mission's substrate names a "current"
 * membership independent of a season, so this is the reading `person-record.ts`
 * makes: cheap for a later mission to replace with an explicit "current
 * season" join if a source ever asks for one.
 *
 * `alias` is a table alias the caller controls; it is never user input.
 */
export function personAssembledStatusSql(alias: string): string {
  return `coalesce(
            (select m.status::text
               from public.season_memberships m
               join public.seasons s on s.id = m.season_id
              where m.person_id = ${alias}.id
              order by s.starts_on desc nulls last, m.created_at desc
              limit 1),
            case
              when exists (
                select 1 from public.recruitment_prospects rp
                 where rp.person_id = ${alias}.id
              ) then 'recruit'
            end
          )`;
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
