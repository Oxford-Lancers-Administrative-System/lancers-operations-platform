import { isServiceError } from "@/lib/db";
import { listRecruitmentBoard } from "@/lib/services/recruitment-board";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { gateShellPage } from "../gate";
import RecruitmentBoardView from "./recruitment-board-view";

/**
 * `/operate/recruitment` — `W1`, LAN-204. The recruitment mission's spine:
 * one board carrying every recruit in the open season, modelled on
 * `../roster/page.tsx` (LAN-186).
 *
 * ## `REQ-authority`
 *
 * Gated on `person_record_authority` — the same four-office capability the
 * roster board reads. A coach, or any operator outside those four offices
 * plus the administrative seat, is refused here, before
 * `listRecruitmentBoard()` is ever called.
 */
export default async function RecruitmentBoardPage({
  searchParams,
}: PageProps<"/operate/recruitment">) {
  const gate = await gateShellPage("/operate/recruitment", "person_record_authority");
  if ("screen" in gate) return gate.screen;
  const { operator } = gate;

  const params = await searchParams;
  const first = (value: string | string[] | undefined): string =>
    Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

  let data: Awaited<ReturnType<typeof listRecruitmentBoard>>;
  try {
    data = await listRecruitmentBoard();
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <UnavailableScreen
        title="Recruitment"
        message={error.message}
        testId="recruitment-unavailable"
      />
    );
  }

  const RESERVED = new Set(["q", "sort", "dir"]);
  const filters: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (RESERVED.has(key)) continue;
    const resolved = first(value);
    if (resolved !== "") filters[key] = resolved;
  }

  return (
    <RecruitmentBoardView
      operatorPersonId={operator.personId}
      season={data.season}
      rows={data.rows}
      events={data.events}
      totalInSeason={data.totalInSeason}
      initialSearch={first(params.q)}
      initialFilters={filters}
      initialSortKey={first(params.sort) || null}
      initialSortDirection={first(params.dir) === "desc" ? "desc" : "asc"}
    />
  );
}
