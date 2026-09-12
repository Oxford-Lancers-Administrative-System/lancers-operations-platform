/**
 * The SQL form of a person's name, for owner-run scripts — LAN-306.
 *
 * The rule is one rule: **a person's name is their formal given name and
 * family name**, never the Known-as alias. `src/lib/services/person-name.ts`
 * holds it for the application and `personDisplayNameSql` in
 * `src/lib/services/sql-text.ts` is its SQL twin; this is the same expression
 * for the `.mjs` scripts, which cannot import TypeScript.
 *
 * It lives here rather than in each script because it was copied into two of
 * them and both copies kept the pre-LAN-306 substitution after the rule
 * changed — the showcase report filed "Vee Frayne" where every page said
 * "Verity Frayne". One copy cannot drift from itself.
 *
 * `family_name` is nullable by design, so the middle branch exists to avoid a
 * trailing space.
 *
 * @param {string} alias the SQL alias of the `public.people` row
 * @returns {string} a `case` expression yielding `text`, or null for no row
 */
export function personDisplayNameSql(alias) {
  return `case
            when ${alias}.id is null then null
            when ${alias}.family_name is null then btrim(${alias}.given_name)
            else btrim(${alias}.given_name) || ' ' || btrim(${alias}.family_name)
          end`;
}
