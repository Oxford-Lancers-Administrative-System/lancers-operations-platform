import { PageHeader } from "@/components/page-header";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { operatorHasCapability } from "@/lib/auth/guards";
import { todayInClubZone } from "@/lib/club-time";
import { isServiceError } from "@/lib/db";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { defaultMonth, parseMonth } from "@/lib/services/calendar";
import { listEventsForOperator, type EventList } from "@/lib/services/events";
import { first } from "@/app/calendar/query";
import {
  OPERATOR_CALENDAR_PATH,
  operatorEventHref,
  OPERATOR_EVENTS_PATH,
} from "@/app/calendar/routes";
import SubscribeToCalendarButton from "@/app/calendar/subscribe-dialog";
import { operatorTileStatus } from "@/app/calendar/tile-status";
import ViewSwitch from "@/app/calendar/view-switch";
import { readEventYear } from "@/app/calendar/year";
import { gateShellPage } from "../../gate";
import { GregorianView, gregorianHref, OxfordView, type Tile } from "./calendar-views";

type CalendarMode = "gregorian" | "oxford";

function modeOf(value: string): CalendarMode {
  return value === "oxford" ? "oxford" : "gregorian";
}

/**
 * The Events calendar — Calendar View, and the Oxford View. LAN-114, remade by
 * LAN-153. Reads `listEventsForOperator()` with no filter — the same call and
 * result the list at `/operate/events` uses, so the two arrangements never
 * disagree (`REQ-three-arrangements`). Read-only: no server action, no form,
 * every navigation a `GET`. Today comes once from `@/lib/club-time`, passed
 * down as `YYYY-MM-DD` — no grid calls `new Date()` itself.
 *
 * Decision history: docs/ux/tickets/LAN-114-event-calendar.md.
 */
export default async function EventCalendarPage({
  searchParams,
}: PageProps<"/operate/events/calendar">) {
  const gate = await gateShellPage(OPERATOR_CALENDAR_PATH);
  if ("screen" in gate) return gate.screen;

  const params = await searchParams;
  const mode = modeOf(first(params.mode));
  const mayManage = operatorHasCapability(gate.operator, "event_calendar_management");
  const today = todayInClubZone();

  let list: EventList;
  try {
    list = await listEventsForOperator();
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <UnavailableScreen
        title="Events calendar"
        message={error.message}
        testId="calendar-unavailable"
      />
    );
  }

  // Awaited here rather than inside the arrangement below: an async component
  // element returned from another async component is resolved by the framework
  // but not by a direct `render(await Page())`, which is the level these screens
  // are tested at.
  const year =
    mode === "oxford"
      ? await readEventYear(list.events, {
          today,
          seasonStartsOn: list.season.startsOn,
          seasonEndsOn: list.season.endsOn,
        })
      : null;

  const byId = new Map(list.events.map((event) => [event.id, event]));
  const tile: Tile = (eventId: string) => ({
    href: operatorEventHref(eventId),
    status: operatorTileStatus(byId.get(eventId)?.status ?? "approved"),
  });

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Events"
        subtitle={<span data-testid="season-label">{`Season ${list.season.label}`}</span>}
        actions={
          <>
            {mayManage ? (
              <Button variant="contained" href="/operate/events/new">
                Create event
              </Button>
            ) : null}
            <SubscribeToCalendarButton />
          </>
        }
      />

      <Stack spacing={1.5}>
        <ViewSwitch
          label="Events view"
          testId="events-view-switch"
          choices={[
            { href: OPERATOR_EVENTS_PATH, label: "List", active: false, testId: "view-list" },
            {
              // Carries where you are, so re-clicking the view you are already
              // in does not quietly send you back to the default month.
              href:
                mode === "oxford"
                  ? `${OPERATOR_CALENDAR_PATH}?mode=oxford`
                  : gregorianHref(
                      parseMonth(first(params.month)) ?? defaultMonth(list.events, today),
                    ),
              label: "Calendar",
              active: true,
              testId: "view-calendar",
            },
          ]}
        />
        <ViewSwitch
          label="Calendar mode"
          testId="calendar-mode-switch"
          choices={[
            {
              href: `${OPERATOR_CALENDAR_PATH}?mode=gregorian`,
              label: "Calendar View",
              active: mode === "gregorian",
              testId: "mode-gregorian",
            },
            {
              href: `${OPERATOR_CALENDAR_PATH}?mode=oxford`,
              label: "Oxford View",
              active: mode === "oxford",
              testId: "mode-oxford",
            },
          ]}
        />
      </Stack>

      {mode === "gregorian" ? (
        <GregorianView events={list.events} params={params} today={today} tile={tile} />
      ) : (
        <OxfordView year={year} tile={tile} />
      )}
    </Stack>
  );
}
