import { isServiceError } from "@/lib/db";
import { readOperatorPreferences } from "@/lib/services/operator-preferences";
import { listRosterBoard } from "@/lib/services/roster-board";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { gateShellPage } from "../gate";
import type { BoardFilters } from "./board-data";
import { buildColumns, redactRow, visibleColumns } from "./board-columns";
import RosterBoard from "./roster-board";
import { operatorHasCapability, operatorHoldsAccess } from "@/lib/auth/guards";
import { ADD_TO_ROSTER, mayViewRoster, ROSTER_REACH } from "@/lib/auth/roster-access";

// `/operate/roster` — W5, LAN-186. Open to any roster category at `view`, the
// same rule as the sidebar entry; each column then follows its own category
// (LAN-432).
export default async function RosterPage({ searchParams }: PageProps<"/operate/roster">) {
  const gate = await gateShellPage("/operate/roster", ROSTER_REACH);
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

  const columns = visibleColumns(buildColumns(data.positionOptions), operator.grants);
  const columnKeys = new Set(columns.map((column) => column.key));

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

  const redactedRows = data.rows.map((row) =>
    redactRow(row, columns, operator.grants),
  ) as typeof data.rows;
  // Jersey holders name who wears each number: Membership data, and only the
  // editor uses them, so they travel only to a seat that may edit a jersey.
  const jerseyEditable = columns.some(
    (column) => column.edit === "jersey" && column.viewOnly !== true,
  );
  const jerseyHolders = jerseyEditable ? data.jerseyHolders : { blue: {}, white: {} };

  // LAN-387, Brian's visual pass item 1: which groups this operator folded away
  // last time, from their own account rather than from this browser.
  const preferences = await readOperatorPreferences(operator.personId);

  return (
    <RosterBoard
      operator={operator}
      columns={columns}
      rows={redactedRows}
      totalInSeason={data.totalInSeason}
      seasonId={data.season.id}
      seasonLabel={data.season.label}
      jerseyHolders={jerseyHolders}
      seasonHasOnboardingItemTypes={data.seasonHasOnboardingItemTypes}
      initialSearch={search}
      initialFilters={filters}
      initialSortKey={sortKey}
      initialSortDirection={sortDirection}
      initialCollapsedGroups={preferences.rosterCollapsedGroups}
      canEditCategories={operatorHasCapability(operator, "role_management")}
      canAddPlayers={operatorHoldsAccess(operator, ADD_TO_ROSTER)}
      canBulkImport={operatorHasCapability(operator, "roster_bulk_import")}
      missingFilterGranted={mayViewRoster(operator.grants, "onboarding")}
    />
  );
}
