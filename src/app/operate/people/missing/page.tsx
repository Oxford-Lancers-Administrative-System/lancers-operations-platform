import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TableCell from "@mui/material/TableCell";
import TableSortLabel from "@mui/material/TableSortLabel";
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
import { labelFor, statusColour, STATUS_LABELS } from "../presentation";
import {
  chaseNeedsAHuman,
  formatChaseNext,
  formatLastContact,
  isNudgeable,
} from "./chase-presentation";
import QueueBoard, { type QueueRowView } from "./queue-board";

/**
 * `W7-01` … `W7-05`, `W7-07` — the missing-data queue. LAN-184,
 * `REQ-missing-queue`. Extended by `W8`/`W9`/`W11` (LAN-218) with two columns
 * — when each person was last contacted and what kind it was, and when the
 * machine will next write, or that it will not — and one action: select one
 * person or several, and nudge.
 *
 * Every person tied to the season in view (or, widened, outside it) with at
 * least one required fact absent, naming which facts per row and never a
 * value. `DEC-w7-07`, drawn deliberately rather than hidden: there is no
 * `refused` or `not applicable` state here, so a departed alumnus with no
 * personal email — `W7-07` — sits in this queue indefinitely until Mission 7
 * builds the state that would retire the row.
 *
 * `W8`'s own locked recommendation: this page defaults to onboarding players
 * only, with Mission 5's full shipped scope one click away
 * (`?players=all`) — a second, independent widen from the existing
 * in-season/outside-season one, because "everybody with missing data" and
 * "everybody, including people outside this season" answer different
 * questions.
 */

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/**
 * Validates the `fact` query param against the real vocabulary rather than
 * trusting a caller's text — the same whitelist discipline `roster.ts`'s
 * `ROSTER_SORT_COLUMNS` uses for `sort`. `REQUIRED_FIELD_LABELS` is the one
 * list of every `RequiredField`, so a new required fact is recognised here
 * without this module naming its own copy of the ten keys.
 */
function isRequiredField(value: string): value is RequiredField {
  return Object.hasOwn(REQUIRED_FIELD_LABELS, value);
}

const SORT_OPTIONS: readonly { value: string; label: string }[] = Object.freeze([
  { value: "missing", label: "How much is missing" },
  { value: "name", label: "Name" },
]);

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

  const rows: QueueRowView[] = entries.map((entry) => {
    const info = entry.membershipId ? chaseInfo.get(entry.membershipId) : undefined;
    const isOnboarding = entry.status === "onboarding";
    const next = isOnboarding && info ? info.next : null;
    return {
      personId: entry.personId,
      membershipId: isOnboarding ? (entry.membershipId ?? null) : null,
      displayName: entry.displayName,
      statusLabel: entry.status === null ? null : labelFor(STATUS_LABELS, entry.status),
      statusColour: statusColour(entry.status),
      clubRoleSummary: entry.clubRoleSummary,
      missingFieldLabels: entry.missingRequiredFields.map((field) => REQUIRED_FIELD_LABELS[field]),
      correctHref: `/operate/people/${entry.personId}/edit?from=missing`,
      personHref: `/operate/people/${entry.personId}`,
      lastContactLabel: isOnboarding ? formatLastContact(info?.lastContact ?? null) : null,
      nextLabel: next ? formatChaseNext(next) : null,
      nextNeedsAHuman: next ? chaseNeedsAHuman(next) : false,
      nudgeable: next ? isNudgeable(next) : false,
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
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ alignItems: { sm: "flex-start" }, justifyContent: "space-between" }}
      >
        <Box>
          <Typography variant="h6" component="h1">
            Missing data
          </Typography>
          <Typography variant="body2" color="text.secondary" data-testid="missing-scope-label">
            {subline}
          </Typography>
        </Box>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
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
        </Stack>
      </Stack>

      <MissingFilters
        basePath={basePath}
        scope={scope}
        sortColumns={SORT_OPTIONS}
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
            <SortableHeader
              column="name"
              label="Name"
              sort={sort}
              direction={direction}
              query={params}
            />
          }
          missingHeader={
            <SortableHeader
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

function SortableHeader({
  column,
  label,
  sort,
  direction,
  query,
}: {
  column: string;
  label: string;
  sort: string;
  direction: string;
  query: Record<string, string | string[] | undefined>;
}) {
  const active = sort === column;
  const next = active
    ? direction === "asc"
      ? "desc"
      : "asc"
    : column === "missing"
      ? "desc"
      : "asc";

  const params = new URLSearchParams();
  for (const key of ["q", "status", "fact", "scope", "players"]) {
    const value = first(query[key]);
    if (value !== "") params.set(key, value);
  }
  params.set("sort", column);
  params.set("dir", next);

  return (
    <TableCell sortDirection={active ? (direction === "asc" ? "asc" : "desc") : false}>
      <TableSortLabel
        active={active}
        direction={active && direction === "desc" ? "desc" : "asc"}
        href={`/operate/people/missing?${params.toString()}`}
        component="a"
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );
}

function withPlayersParam(href: string, onboardingOnly: boolean): string {
  if (onboardingOnly) return href;
  const joiner = href.includes("?") ? "&" : "?";
  return `${href}${joiner}players=all`;
}

function withScopeParam(href: string, scope: PeopleScope): string {
  if (scope !== "outside_season") return href;
  const joiner = href.includes("?") ? "&" : "?";
  return `${href}${joiner}scope=outside`;
}

/**
 * Two distinguishable outcomes — `W7-04` and `W7-05` — and neither is a
 * failure. Nobody missing anything is a good outcome and says so; a filter
 * matching nothing offers to clear it, matching the roster's own distinction
 * between a filtered empty and a system empty.
 */
function EmptyQueue({
  totalMissing,
  scope,
  outsideHref,
}: {
  totalMissing: number;
  scope: PeopleScope;
  outsideHref: string;
}) {
  const nothingMissingAtAll = totalMissing === 0;

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 4 } }}>
      <Stack spacing={2} sx={{ maxWidth: 640 }}>
        <Typography variant="h6" component="h2">
          {nothingMissingAtAll ? "Every required fact is recorded" : "Nobody matches these filters"}
        </Typography>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          data-testid={nothingMissingAtAll ? "missing-empty" : "missing-filter-empty"}
        >
          {nothingMissingAtAll ? (
            scope === "in_season" ? (
              <Button variant="contained" href={outsideHref} sx={{ minHeight: 44 }}>
                See people outside this season
              </Button>
            ) : null
          ) : (
            <Button
              variant="outlined"
              href={
                scope === "in_season"
                  ? "/operate/people/missing"
                  : "/operate/people/missing?scope=outside"
              }
              sx={{ minHeight: 44 }}
            >
              Clear filters
            </Button>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}
