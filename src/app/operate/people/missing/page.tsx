import Button from "@mui/material/Button";
import { PageHeader } from "@/components/page-header";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { isServiceError, withTransaction } from "@/lib/db";
import {
  DEFAULT_MISSING_SORT,
  listMissingDataQueue,
  type MissingQueue,
  type PeopleScope,
} from "@/lib/services/people-directory";
import { REQUIRED_FIELD_LABELS, type RequiredField } from "@/lib/services/person-required";
import {
  readOnboardingChaseQueueInfoIn,
  type OnboardingChaseQueueInfo,
} from "@/lib/services/onboarding-chase";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { gateShellPage } from "../../gate";
import MissingFilters from "./missing-filters";
import { labelFor, STATUS_LABELS } from "../presentation";
import {
  chaseNeedsAHuman,
  formatChaseNext,
  formatLastContact,
  isNudgeable,
} from "./chase-presentation";
import QueueBoard, { type QueueRowView } from "./queue-board";
import EmptyQueue from "./empty-queue";
import MissingSortableHeader from "./missing-sortable-header";
import {
  first,
  isRequiredField,
  MISSING_SORT_OPTIONS,
  withPlayersParam,
  withScopeParam,
} from "./missing-query";

/**
 * `W7-01` … `W7-05`, `W7-07` — the missing-data queue. LAN-184,
 * `REQ-missing-queue`. Extended by `W8`/`W9`/`W11` (LAN-218) with contact
 * history, next-chase and a nudge action.
 */
export default async function MissingDataPage({
  searchParams,
}: PageProps<"/operate/people/missing">) {
  const gate = await gateShellPage("/operate/people/missing", "person_record_authority");
  if ("screen" in gate) return gate.screen;

  const params = await searchParams;
  const search = first(params.q);
  const status = first(params.status);
  const factParam = first(params.fact);
  const fact: RequiredField | null = isRequiredField(factParam) ? factParam : null;
  const explicitSort = first(params.sort);
  const sort = explicitSort || DEFAULT_MISSING_SORT;
  const direction = first(params.dir) || (sort === "missing" ? "desc" : "asc");
  const scope: PeopleScope = first(params.scope) === "outside" ? "outside_season" : "in_season";
  const onboardingOnly = first(params.players) !== "all";
  const filtered = search !== "" || status !== "" || fact !== null;

  let queue: MissingQueue;
  try {
    queue = await listMissingDataQueue({
      scope,
      search,
      status: status || null,
      fact,
      sort,
      direction,
      onlyOnboardingPlayers: onboardingOnly,
    });
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <UnavailableScreen
        title="Missing data"
        message={error.message}
        testId="missing-unavailable"
      />
    );
  }

  const totalMissing = queue.totalMissing;
  let entries = queue.entries;

  // `W8`'s own delegated sort — longest-waiting first, never-contacted at the
  // top — applies only on first open of the onboarding-only view; an
  // operator's own explicit `sort` choice (Name/Missing, from the shipped
  // headers below) always wins once made.
  const chaseInfo: ReadonlyMap<string, OnboardingChaseQueueInfo> =
    entries.length > 0
      ? await withTransaction((tx) =>
          readOnboardingChaseQueueInfoIn(
            tx,
            entries
              .map((entry) => entry.membershipId)
              .filter((id): id is string => typeof id === "string"),
          ),
        )
      : new Map();

  if (onboardingOnly && explicitSort === "") {
    entries = [...entries].sort((a, b) => {
      const aWhen = a.membershipId ? chaseInfo.get(a.membershipId)?.lastContact?.occurredAt : null;
      const bWhen = b.membershipId ? chaseInfo.get(b.membershipId)?.lastContact?.occurredAt : null;
      const aTime = aWhen ? aWhen.getTime() : -Infinity;
      const bTime = bWhen ? bWhen.getTime() : -Infinity;
      if (aTime !== bTime) return aTime - bTime;
      return a.displayName.localeCompare(b.displayName);
    });
  }

  // Correction round 1, `C-2` (Brian, 2026-09-03 walkthrough): no reachable
  // mobile number ranks first, above every other ordering above, applied as a
  // stable partition.
  const reachabilityRank = (entry: (typeof entries)[number]) => (entry.hasMobile ? 1 : 0);
  entries = [...entries].sort((a, b) => reachabilityRank(a) - reachabilityRank(b));

  const rows: QueueRowView[] = entries.map((entry) => {
    const info = entry.membershipId ? chaseInfo.get(entry.membershipId) : undefined;
    const isOnboarding = entry.status === "onboarding";
    const next = isOnboarding && info ? info.next : null;
    const hasReachableNumber = info?.hasReachableNumber ?? true;
    return {
      personId: entry.personId,
      membershipId: isOnboarding ? (entry.membershipId ?? null) : null,
      displayName: entry.displayName,
      statusLabel: entry.status === null ? null : labelFor(STATUS_LABELS, entry.status),
      statusCode: entry.status,
      clubRoleSummary: entry.clubRoleSummary,
      missingFieldLabels: entry.missingRequiredFields.map((field) => REQUIRED_FIELD_LABELS[field]),
      correctHref: `/operate/people/${entry.personId}/edit?from=missing`,
      personHref: `/operate/people/${entry.personId}`,
      lastContactLabel: isOnboarding ? formatLastContact(info?.lastContact ?? null) : null,
      nextLabel: next ? formatChaseNext(next, hasReachableNumber) : null,
      nextNeedsAHuman: next ? chaseNeedsAHuman(next) : false,
      nudgeable: next ? isNudgeable(next, hasReachableNumber) : false,
    };
  });

  const basePath = "/operate/people/missing";
  const outsideHref = withPlayersParam(`${basePath}?scope=outside`, onboardingOnly);
  const backHref = withPlayersParam(basePath, onboardingOnly);
  const widenPlayersHref = withScopeParam(`${basePath}?players=all`, scope);
  const narrowPlayersHref = withScopeParam(basePath, scope);
  const totalFactsMissing = entries.reduce(
    (sum, entry) => sum + entry.missingRequiredFields.length,
    0,
  );

  const scopeLabel =
    scope === "in_season"
      ? `Season ${queue.season.label}`
      : `Outside the ${queue.season.label} season`;
  const playersLabel = onboardingOnly ? "onboarding players" : "everybody with missing data";

  const countLabel = `${totalMissing} of ${totalMissing} ${totalMissing === 1 ? "person" : "people"}`;
  const subline =
    totalMissing === 0
      ? `${scopeLabel} · nothing missing among ${playersLabel}`
      : filtered
        ? `${scopeLabel} · ${entries.length} of ${totalMissing} people · ${totalFactsMissing} facts`
        : `${scopeLabel} · ${countLabel} · ${totalFactsMissing} facts`;

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Missing data"
        subtitle={
          <Typography component="span" variant="body2" data-testid="missing-scope-label">
            {subline}
          </Typography>
        }
        actions={
          <>
            {onboardingOnly ? (
              <Button
                variant="text"
                href={widenPlayersHref}
                sx={{ minHeight: 44 }}
                data-testid="see-everyone-with-missing-data"
              >
                See everybody with missing data
              </Button>
            ) : (
              <Button
                variant="text"
                href={narrowPlayersHref}
                sx={{ minHeight: 44 }}
                data-testid="see-onboarding-players-only"
              >
                Onboarding players only
              </Button>
            )}
            {entries.length > 0 || totalMissing === 0 ? (
              scope === "in_season" ? (
                <Button variant="outlined" href={outsideHref} sx={{ minHeight: 44 }}>
                  See people outside this season
                </Button>
              ) : (
                <Button variant="outlined" href={backHref} sx={{ minHeight: 44 }}>
                  Back to this season
                </Button>
              )
            ) : null}
          </>
        }
      />

      <MissingFilters
        basePath={basePath}
        scope={scope}
        sortColumns={MISSING_SORT_OPTIONS}
        search={search}
        status={status}
        fact={fact ?? ""}
        sort={sort}
        direction={direction}
      />

      {entries.length === 0 ? (
        <EmptyQueue totalMissing={totalMissing} scope={scope} outsideHref={outsideHref} />
      ) : (
        <QueueBoard
          rows={rows}
          nameHeader={
            <MissingSortableHeader
              column="name"
              label="Name"
              sort={sort}
              direction={direction}
              query={params}
            />
          }
          missingHeader={
            <MissingSortableHeader
              column="missing"
              label="Missing"
              sort={sort}
              direction={direction}
              query={params}
            />
          }
        />
      )}
    </Stack>
  );
}
