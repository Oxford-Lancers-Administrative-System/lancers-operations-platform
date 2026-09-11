import "server-only";

import { withTransaction } from "@/lib/db";
import { readCurrentSeasonIn } from "../seasons";
import {
  compareBy,
  DEFAULT_PEOPLE_SORT,
  fetchDirectoryRows,
  matchesSearch,
  normaliseSearch,
  PEOPLE_LIST_SORT_COLUMNS,
  resolveDirection,
  toEntry,
  type PeopleList,
  type PeopleListFilters,
} from "./shared";

/**
 * The People list — `W1`. Scoped to the season in view unless `scope` is
 * `"outside_season"`, `W1`'s widen action. See `relocations.md`.
 */
export async function listPeople(filters: PeopleListFilters): Promise<PeopleList> {
  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);
    const rows = await fetchDirectoryRows(tx, season, filters.scope);
    const term = normaliseSearch(filters.search);

    const totalInScope = rows.length;

    let entries = rows.map((row) => toEntry(row, season, filters.scope, term));

    if (term !== null) {
      entries = entries.filter((_, index) => matchesSearch(rows[index], term));
    }
    if (filters.status) {
      entries = entries.filter((entry) => entry.status === filters.status);
    }
    if (filters.missingOnly) {
      entries = entries.filter((entry) => entry.missingRequiredFields.length > 0);
    }

    const { sort, direction } = resolveDirection(
      filters.sort ?? DEFAULT_PEOPLE_SORT,
      filters.direction,
      PEOPLE_LIST_SORT_COLUMNS,
      DEFAULT_PEOPLE_SORT,
    );
    entries = [...entries].sort(compareBy(sort, direction));

    return { season, scope: filters.scope, entries, totalInScope };
  });
}
