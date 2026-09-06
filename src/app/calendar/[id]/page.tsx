import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Fact, FactGrid } from "@/components/fact";
import { StatusChip } from "@/components/status-chip";
import { Notice } from "@/components/notice";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { todayInClubZone } from "@/lib/club-time";
import { isServiceError } from "@/lib/db";
import {
  CLUB_TIME_ZONE,
  DELIVERY_MODE_LABELS,
  describeAttendance,
  EQUIPMENT_LABEL,
  formatDetailWhen,
  labelFor,
  STATUS_LABELS,
  TYPE_LABELS,
} from "@/lib/services/event-vocabulary";
import { readPublicEvent, type PublicEventDetail } from "@/lib/services/events";
import PublicShell from "../public-shell";
import { PUBLIC_CALENDAR_PATH } from "../routes";
import SubscribeToCalendarButton from "../subscribe-dialog";
import { readEventYear } from "../year";

/**
 * One event, as a stranger sees it. LAN-153.
 *
 * ## The whole record, and nothing about people
 *
 * Brian, 20 August 2026: "people who see the calendar should see a normal
 * calendar of events … descriptions, what gear to bring, what type of events,
 * everything like that … They shouldn't be able to see other details about it.
 * There are going to be private details per event, like RSVP attendance and
 * things of that nature, that shouldn't be on the public calendar."
 *
 * `REQ-public-calendar` makes that structural rather than a rendering choice: "a
 * public event page renders without touching participation data at all, not
 * merely hides it after loading". `readPublicEvent` reads eleven columns off
 * `events` and joins nothing — no audience, no invitations, no RSVP, no
 * attendance, no delivery, and no `joining_url`.
 *
 * ## The joining URL of an online event is never here
 *
 * `REQ-no-joining-url`. Chalk is on Teams (D20), and a publicly readable joining
 * link is an open door into a club meeting for anyone who finds this page. The
 * page says the event is online and where it is *called*; it does not say how to
 * join it, and it does not explain why — the absence needs no label (Brian,
 * 21 August 2026).
 *
 * ## Scoped to the open season
 *
 * `REQ-one-open-season`. An id from a season the club is not operating reads as
 * gone, in the same words as an id that never existed — a public address that
 * resolved one would be a way to reach another season, which no surface offers.
 */
export default async function PublicEventPage({ params }: PageProps<"/calendar/[id]">) {
  const { id } = await params;

  let event: PublicEventDetail;
  try {
    event = await readPublicEvent(id);
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <PublicShell seasonLabel={null}>
        <Stack spacing={2}>
          <Notice severity="info" testId="public-event-missing">
            {error.message}
          </Notice>
          <Box>
            <Button variant="outlined" href={PUBLIC_CALENDAR_PATH}>
              Back to the calendar
            </Button>
          </Box>
        </Stack>
      </PublicShell>
    );
  }

  const today = todayInClubZone();
  const year = await readEventYear([event], { today });

  return (
    <PublicShell seasonLabel={null} action={<SubscribeToCalendarButton />}>
      <Stack spacing={3}>
        <PageHeader
          title={event.name}
          struckThrough={event.isCancelled}
          testId="public-event-name"
          back={{ href: PUBLIC_CALENDAR_PATH, label: "Back to the calendar" }}
          subtitle={`${formatDetailWhen(event)} · ${CLUB_TIME_ZONE}`}
          status={
            event.isCancelled ? (
              <StatusChip
                domain="event"
                status="cancelled"
                label={labelFor(STATUS_LABELS, "cancelled")}
                testId="public-event-cancelled"
              />
            ) : undefined
          }
        />
        <Section title="Details">
          <FactGrid>
            <Fact
              testId="public-event-fact"
              label="Type"
              value={labelFor(TYPE_LABELS, event.eventType)}
            />
            <Fact testId="public-event-fact" label="Where" value={whereItIs(event)} />
            <Fact
              label="Term and week"
              value={year === null ? null : year.coordinateLabel(event.scheduledOn)}
            />
            <Fact
              testId="public-event-fact"
              label="Attendance"
              value={describeAttendance(event.isMandatory)}
            />
            {event.requiredEquipment ? (
              <Fact
                testId="public-event-fact"
                label={EQUIPMENT_LABEL}
                value={event.requiredEquipment}
              />
            ) : null}
            {event.description ? (
              <Box sx={{ gridColumn: { sm: "1 / -1" } }}>
                <Fact testId="public-event-fact" label="Description" value={event.description} />
              </Box>
            ) : null}
          </FactGrid>
        </Section>
      </Stack>
    </PublicShell>
  );
}

/**
 * Where the event is, at the public tier — an address, or that it is online.
 *
 * The venue field holds an address when the event is in person and the
 * destination it is *called* when it is online (D21). Both are safe to state;
 * the link that joins the online one is not, and is not in this payload.
 */
function whereItIs(event: PublicEventDetail): string {
  if (event.deliveryMode === "online") {
    return event.venue ?? labelFor(DELIVERY_MODE_LABELS, "online");
  }
  return event.venue ?? labelFor(DELIVERY_MODE_LABELS, "in_person");
}
