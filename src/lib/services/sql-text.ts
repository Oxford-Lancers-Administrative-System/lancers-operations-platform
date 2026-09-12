// Shared SQL-fragment helpers for a person's name and LIKE-escaping — one copy, not the per-caller duplicates this replaced.

export function escapeLikePattern(value: string | null): string | null {
  return value === null ? null : value.replace(/([\\%_])/g, "\\$1");
}

export function personDisplayAliasSql(alias: string): string {
  return `(select da.alias
             from public.person_aliases da
            where da.person_id = ${alias}.id and da.is_display_name
            limit 1)`;
}

/** LAN-183, `REQ-status-ladder`. */
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
 * The SQL twin of `personDisplayName` (`person-name.ts`) — LAN-306. The formal
 * given and family name, never the Known-as alias: an alias substituted for a
 * given name made the same person read as two people either side of a recruit
 * conversion. Known as is shown beside the name, as its own labelled value, by
 * the surfaces that identify a person in detail; `personDisplayAliasSql` above
 * is how they read it.
 */
export function personDisplayNameSql(alias: string): string {
  return `case
            when ${alias}.id is null then null
            when ${alias}.family_name is null then btrim(${alias}.given_name)
            else btrim(${alias}.given_name) || ' ' || btrim(${alias}.family_name)
          end`;
}
