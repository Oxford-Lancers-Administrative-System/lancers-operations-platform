import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { todayInClubZone } from "@/lib/club-time";
import { isServiceError } from "@/lib/db";
import {
  CLUB_TIME_ZONE,
  DELIVERY_MODE_LABELS,
  describeAttendance,
  formatDetailWhen,
  labelFor,
  STATUS_LABELS,
  TYPE_LABELS,
} from "@/lib/services/event-vocabulary";
import { readPublicEvent, type PublicEventDetail } from "@/lib/services/events";
import PublicShell from "../public-shell";
import { PUBLIC_CALENDAR_PATH } from "../routes";
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
          <Alert severity="info" data-testid="public-event-missing">
            {error.message}
          </Alert>
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
    <PublicShell
      seasonLabel={null}
      action={
        <Button variant="outlined" size="small" href={PUBLIC_CALENDAR_PATH}>
          Back to the calendar
        </Button>
      }
    >
      <Stack spacing={3} sx={{ maxWidth: 880 }}>
        <Stack spacing={1}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "baseline", flexWrap: "wrap" }}>
            <Typography
              variant="h5"
              component="h1"
              sx={{
                fontWeight: 800,
                textDecoration: event.isCancelled ? "line-through" : "none",
              }}
              data-testid="public-event-name"
            >
              {event.name}
            </Typography>
            {event.isCancelled ? (
              <Chip
                color="warning"
                label={labelFor(STATUS_LABELS, "cancelled")}
                data-testid="public-event-cancelled"
              />
            ) : null}
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {`${formatDetailWhen(event)} · ${CLUB_TIME_ZONE}`}
          </Typography>
        </Stack>

        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
              gap: { xs: 2, md: 3 },
            }}
          >
            <Fact label="Type" value={labelFor(TYPE_LABELS, event.eventType)} />
            <Fact label="Where" value={whereItIs(event)} />
            <Fact
              label="Term and week"
              value={year === null ? "—" : year.coordinateLabel(event.scheduledOn)}
            />
            <Fact label="Attendance" value={describeAttendance(event.isMandatory)} />
            {event.requiredEquipment ? (
              <Fact label="What to bring" value={event.requiredEquipment} />
            ) : null}
            {event.description ? (
              <Box sx={{ gridColumn: { sm: "1 / -1" } }}>
                <Fact label="Description" value={event.description} />
              </Box>
            ) : null}
          </Box>
        </Paper>
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Box data-testid="public-event-fact">
      <Typography variant="overline" component="p" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body1" sx={{ fontWeight: 600 }}>
        {value}
      </Typography>
    </Box>
  );
}
