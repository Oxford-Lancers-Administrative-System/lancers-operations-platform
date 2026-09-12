/**
 * How a person is named on an operator surface — LAN-306, one rule, one file.
 *
 * Three implementations of "display name" had drifted apart: the person record
 * substituted the Known-as alias for the given name, the roster showed the
 * formal name, and the audience builder did a third thing. The same person
 * therefore appeared to be two people either side of a recruit conversion, and
 * a merge comparison could not be read at all.
 *
 * The rule, decided for this round: **a person's name is their formal given
 * name and family name.** Known as is a separate, labelled value shown beside
 * the name wherever the person is identified in detail — never spliced into it,
 * because an alias silently replacing a given name is a claim that the record
 * says something it does not. Brian removed Known-as from returner intake on
 * LAN-74 as "not a good way to talk about it"; recruitment add still collects
 * it, and this is where that collected value belongs.
 *
 * `personDisplayNameSql` in `sql-text.ts` is the SQL twin of the first function
 * here, for the reads that compose a name in the database. The two must say the
 * same thing.
 *
 * No `"server-only"`: a client component naming a person needs this too.
 */

/** The person's name. Never the alias, whatever `is_display_name` says. */
export function personDisplayName(givenName: string, familyName: string | null): string {
  const given = givenName.trim();
  const family = familyName?.trim();
  return family ? `${given} ${family}` : given;
}

/**
 * The Known-as value worth showing as its own field, or `null`.
 *
 * An alias equal to the given name is not a second way to refer to anybody, so
 * it is not shown; `fillKnownAsIfDifferentIn` already refuses to write one, and
 * this keeps an older row from rendering "Jonathan, known as Jonathan".
 */
export function knownAsOf(givenName: string, displayAlias: string | null): string | null {
  const alias = displayAlias?.trim();
  if (!alias) return null;
  return alias.toLowerCase() === givenName.trim().toLowerCase() ? null : alias;
}
