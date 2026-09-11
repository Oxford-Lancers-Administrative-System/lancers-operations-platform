import "server-only";

import { withTransaction } from "@/lib/db";
import { readCurrentSeasonIn } from "../seasons";
import {
  compareBy,
  DEFAULT_MISSING_SORT,
  fetchDirectoryRows,
  matchesSearch,
  MISSING_QUEUE_SORT_COLUMNS,
  normaliseSearch,
  resolveDirection,
  toEntry,
  type MissingQueue,
  type MissingQueueFilters,
} from "./shared";

/** The missing-data queue — `W7`. Every person with at least one required fact absent, naming which. */
export async function listMissingDataQueue(filters: MissingQueueFilters): Promise<MissingQueue> {
  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);
    const rows = await fetchDirectoryRows(tx, season, filters.scope);
    const term = normaliseSearch(filters.search);

    let entries = rows
      .map((row) => toEntry(row, season, filters.scope, term))
      .filter((entry) => entry.missingRequiredFields.length > 0);

    // LAN-218: applied before totalMissing is captured — a scope decision, like `scope` itself.
    if (filters.onlyOnboardingPlayers) {
      entries = entries.filter((entry) => entry.status === "onboarding");
    }

    const totalMissing = entries.length;

    if (term !== null) {
      const missingRowIds = new Set(entries.map((entry) => entry.personId));
      const matchingIds = new Set(
        rows
          .filter((row) => missingRowIds.has(row.person_id) && matchesSearch(row, term))
          .map((row) => row.person_id),
      );
      entries = entries.filter((entry) => matchingIds.has(entry.personId));
    }
    if (filters.status) {
      entries = entries.filter((entry) => entry.status === filters.status);
    }
    if (filters.fact) {
      const fact = filters.fact;
      entries = entries.filter((entry) => entry.missingRequiredFields.includes(fact));
    }

    const { sort, direction } = resolveDirection(
      filters.sort ?? DEFAULT_MISSING_SORT,
      filters.direction,
      MISSING_QUEUE_SORT_COLUMNS,
      DEFAULT_MISSING_SORT,
    );
    // Most-missing-first by default (W7).
    const effectiveDirection = sort === "missing" && filters.direction == null ? "desc" : direction;
    entries = [...entries].sort(compareBy(sort, effectiveDirection));

    return { season, scope: filters.scope, entries, totalMissing };
  });
}
