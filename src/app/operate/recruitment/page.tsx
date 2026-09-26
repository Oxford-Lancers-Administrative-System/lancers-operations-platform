import { isServiceError } from "@/lib/db";
import { readOperatorPreferences } from "@/lib/services/operator-preferences";
import { listRecruitmentBoard } from "@/lib/services/recruitment-board";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { gateShellPage } from "../gate";
import RecruitmentBoardView from "./recruitment-board-view";
import { operatorHoldsAccess } from "@/lib/auth/guards";
import { ADD_RECRUITS, RECRUITING_REACH } from "@/lib/auth/roster-access";
import { recruitingAccessFor, redactRecruitmentRow } from "@/lib/services/recruitment-board-access";
import type { RecruitmentBoardRow } from "@/lib/services/recruitment-board";

// `/operate/recruitment` — `W1`, LAN-204, modelled on ../roster/page.tsx
// (LAN-186). Open to any recruiting category at `view`, the sidebar's own
// rule; each column then follows its category and a `none` category's
// fields never leave this server (LAN-432).
export default async function RecruitmentBoardPage({
  searchParams,
}: PageProps<"/operate/recruitment">) {
  const gate = await gateShellPage("/operate/recruitment", RECRUITING_REACH);
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

  const preferences = await readOperatorPreferences(operator.personId);
  const access = recruitingAccessFor(operator.grants);
  const rows = data.rows.map((row) =>
    redactRecruitmentRow(row, access),
  ) as unknown as readonly RecruitmentBoardRow[];

  return (
    <RecruitmentBoardView
      operatorPersonId={operator.personId}
      initialCollapsedGroups={preferences.recruitmentCollapsedGroups}
      season={data.season}
      rows={rows}
      events={access.recruit_events === "none" ? [] : data.events}
      access={access}
      mayAddRecruits={operatorHoldsAccess(operator, ADD_RECRUITS)}
      totalInSeason={data.totalInSeason}
      initialSearch={first(params.q)}
      initialFilters={filters}
      initialSortKey={first(params.sort) || null}
      initialSortDirection={first(params.dir) === "desc" ? "desc" : "asc"}
    />
  );
}
