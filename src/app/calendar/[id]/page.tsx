import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Fact, FactGrid } from "@/components/fact";
import { StatusChip } from "@/components/status-chip";
import { Notice } from "@/components/notice";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import { CALENDAR_DESCRIPTION, publicPageMetadata } from "@/lib/brand";
import { todayInClubZone } from "@/lib/club-time";
import { isServiceError } from "@/lib/db";
import {
  CLUB_TIME_ZONE,
  DELIVERY_MODE_LABELS,
  describeAttendance,
  EQUIPMENT_LABEL,
  formatDetailWhen,
  JOINING_LINK_LABEL,
  labelFor,
  STATUS_LABELS,
} from "@/lib/services/event-vocabulary";
import { readPublicEvent, type PublicEventDetail } from "@/lib/services/events";
import { safeUri } from "@/lib/services/safe-uri";
import PublicShell from "../public-shell";
import { PUBLIC_CALENDAR_PATH } from "../routes";
import SubscribeToCalendarButton from "../subscribe-dialog";
import { readEventYear } from "../year";

/**
 * One event, as a stranger sees it. LAN-153. `REQ-public-calendar`:
 * `readPublicEvent` reads twelve columns off `events` and joins nothing — no
 * audience, invitations, RSVP, attendance or delivery. The joining URL of an
 * online event is here (LAN-284, reversing this file's earlier rule);
 * protection moved to the meeting's own passcode, not this page. `safeUri`
 * gates the link (LAN-272 review finding F1: an unrefused `javascript:` value
 * once ran script in this origin with the operator's session live) as the
 * third of three checks. `REQ-one-open-season`: an id outside the open season
 * reads as gone, identically to one that never existed.
 */
/** One event's card (LAN-269 item 4) — static and names no event, so a shared link unfurls as the calendar it belongs to. */
export const metadata: Metadata = publicPageMetadata("Club calendar", CALENDAR_DESCRIPTION);

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
  const joiningUrl = safeUri(event.joiningUrl);

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
            <Fact testId="public-event-fact" label="Type" value={event.templateName} />
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
            {/* LAN-284. Online events only, per the schema — see module header, F1. */}
            {joiningUrl !== null ? (
              <Fact
                testId="public-event-joining-url"
                label={JOINING_LINK_LABEL}
                value={
                  <Link
                    href={joiningUrl}
                    variant="body2"
                    rel="noopener noreferrer"
                    target="_blank"
                    sx={{ overflowWrap: "anywhere" }}
                  >
                    {joiningUrl}
                  </Link>
                }
              />
            ) : null}
            {/* LAN-264. Free text the operator typed; a kit list stays a list. */}
            {event.requiredEquipment ? (
              <Fact
                testId="public-event-fact"
                label={EQUIPMENT_LABEL}
                value={event.requiredEquipment}
                multiline
              />
            ) : null}
            {event.description ? (
              <Box sx={{ gridColumn: { sm: "1 / -1" } }}>
                <Fact
                  testId="public-event-fact"
                  label="Description"
                  value={event.description}
                  multiline
                />
              </Box>
            ) : null}
          </FactGrid>
        </Section>
      </Stack>
    </PublicShell>
  );
}

/** Where the event is, at the public tier — an address, or that it is online (D21). The joining link is not in this payload. */
function whereItIs(event: PublicEventDetail): string {
  if (event.deliveryMode === "online") {
    return event.venue ?? labelFor(DELIVERY_MODE_LABELS, "online");
  }
  return event.venue ?? labelFor(DELIVERY_MODE_LABELS, "in_person");
}
