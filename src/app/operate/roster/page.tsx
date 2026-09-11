import { isServiceError } from "@/lib/db";
import { listRosterBoard } from "@/lib/services/roster-board";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { gateShellPage } from "../gate";
import type { BoardFilters } from "./board-data";
import { buildColumns, redactRow, visibleColumns } from "./board-columns";
import RosterBoard from "./roster-board";

// `/operate/roster` — W5, LAN-186. Gated on `person_record_authority` (`REQ-authority`).
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
