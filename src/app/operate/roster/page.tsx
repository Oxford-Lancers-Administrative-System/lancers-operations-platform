import { isServiceError } from "@/lib/db";
import { listRosterBoard } from "@/lib/services/roster-board";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { gateShellPage } from "../gate";
import type { BoardFilters } from "./board-data";
import { buildColumns, redactRow, visibleColumns } from "./board-columns";
import RosterBoard from "./roster-board";

/**
 * `/operate/roster` — W5, the season's squad as a twenty-column board. LAN-186.
 *
 * Redesigned, not extended (portfolio rule 3): this replaces the six-column
 * list LAN-75 shipped, root and branch. Authority: LAN-186's own acceptance,
 * `workflows/W5-work-this-seasons-roster.md`, `acceptance/W5.md`, and the
 * approved photographs at `mockups/W5-work-this-seasons-roster.html`.
 *
 * ## `REQ-authority`: "Four-role only, for the grid and every column on it"
 *
 * The page opens with `person_record_authority` — the same capability LAN-183
 * gates the full person record behind, and the four offices Q-4 names. A coach,
 * or any operator outside those four roles plus the administrative seat, is
 * refused **here**, before `listRosterBoard()` is ever called: not merely
 * unrendered, absent. `visibleColumns()` and `redactRow()` then apply the same
 * capability again per column, which is the mechanism the issue calls "moot
 * while four-role — build it anyway", so a later, narrower grant on one column
 * drops it from the payload automatically.
 */
export default async function RosterPage({ searchParams }: PageProps<"/operate/roster">) {
  const gate = await gateShellPage("/operate/roster", "person_record_authority");
  if ("screen" in gate) return gate.screen;
  const { operator } = gate;

  const params = await searchParams;
  const first = (value: string | string[] | undefined): string =>
    Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

  let data: Awaited<ReturnType<typeof listRosterBoard>>;
  try {
    data = await listRosterBoard();
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return <UnavailableScreen title="Roster" message={error.message} testId="roster-unavailable" />;
  }

  const columns = visibleColumns(buildColumns(data.positionOptions), operator.roleCodes);
  const columnKeys = new Set(columns.map((column) => column.key));

  // Every column key is a legal filter key. Anything else in the query string
  // — including a filter naming a column this viewer's role does not grant —
  // is ignored rather than trusted, matching the fail-closed posture
  // `rosterOrderBy()` in `membership.ts` uses for `sort`.
  const RESERVED = new Set(["q", "sort", "dir"]);
  const filters: BoardFilters = {};
  for (const [key, value] of Object.entries(params)) {
    if (RESERVED.has(key) || !columnKeys.has(key)) continue;
    const resolved = first(value);
    if (resolved !== "") filters[key] = resolved;
  }

  const search = first(params.q);
  const sortKeyRaw = first(params.sort);
  const sortKey =
    sortKeyRaw !== "" && (sortKeyRaw === "displayName" || columnKeys.has(sortKeyRaw))
      ? sortKeyRaw
      : "displayName";
  const sortDirection = first(params.dir) === "desc" ? "desc" : "asc";

  // Redacted, full width. Search, filter and sort all happen client-side now
  // (LAN-186 item 11) over this one fetch: `RosterBoard` calls `applyBoard()`
  // itself for every interaction, rather than this page re-running for each
  // one. The URL's own params seed only the client's *initial* state below, so
  // a bookmarked or refreshed link still opens already filtered — that first
  // load is the one real fetch Brian accepted taking a few seconds; nothing
  // after it does.
  const redactedRows = data.rows.map((row) => redactRow(row, columns)) as typeof data.rows;

  return (
    <RosterBoard
      operator={operator}
      columns={columns}
      rows={redactedRows}
      totalInSeason={data.totalInSeason}
      seasonId={data.season.id}
      seasonLabel={data.season.label}
      jerseyHolders={data.jerseyHolders}
      initialSearch={search}
      initialFilters={filters}
      initialSortKey={sortKey}
      initialSortDirection={sortDirection}
    />
  );
}
