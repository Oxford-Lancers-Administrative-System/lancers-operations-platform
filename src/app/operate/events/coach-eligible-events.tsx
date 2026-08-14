"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useFilterSearch } from "../filter-search";

/** One occurred event, reduced to what a coach needs to pick the right one. */
export interface CoachEligibleEvent {
  id: string;
  name: string;
  when: string;
  venue: string | null;
}

export const COACH_EVENTS_HEADING = "Attendance";
export const COACH_EVENTS_DETAIL = "Occurred events only";

export const COACH_EVENTS_NOTE =
  "An event appears here once an authorized operator has marked it occurred. Coach " +
  "attendance access does not include Mark occurred or Mark not held.";

export const COACH_EVENTS_EMPTY =
  "No event in this season has been marked occurred yet. Attendance opens as soon as an " +
  "authorized operator asserts that one has.";

export const COACH_EVENTS_FILTER_EMPTY =
  "No occurred event matches that search. Clear it to see every event you can record " +
  "attendance for.";

/**
 * The coaching assignment's whole destination — the list UX-90's **Return to
 * eligible events** returns to, and what UX-91's sidebar entry opens. LAN-110.
 *
 * ## Why it is this route and not a new one
 *
 * `slice-ux.md` § 4's route contract is closed, and this ticket may not add to
 * it. So `/operate/events` is shared, and — exactly as § 4 already says of the
 * attendance route — the *presentation* is capability-scoped. An operator gets
 * the club calendar; a coach gets the events they can take a register for.
 *
 * ## What is deliberately not on it
 *
 * Everything that is event administration rather than attendance: no **Create
 * event**, no status filter, no draft, pending, approved, cancelled or not-held
 * event, no audience or response counts, and no link to `/operate/events/[id]`,
 * which is where approval, the occurrence assertion and delivery live. § 3
 * withholds all of it from a coaching assignment, and withholding it here is a
 * courtesy on top of the refusal — the event detail refuses a coach outright.
 *
 * A search box, and nothing else. A club plays and practises upwards of sixty
 * times a season and a coach at the side of a pitch is looking for one of them;
 * a filter set that let them ask questions about the calendar would be the
 * administration this screen exists not to give them.
 */
export function CoachEligibleEvents({
  events,
  search,
  filtered,
}: {
  events: readonly CoachEligibleEvent[];
  search: string;
  filtered: boolean;
}) {
  const router = useRouter();
  const push = useCallback((href: string) => router.push(href), [router]);
  const { typed, setTyped } = useFilterSearch({
    search,
    basePath: "/operate/events",
    filters: {},
    push,
  });

  return (
    <Stack spacing={3} sx={{ maxWidth: 900 }} data-testid="coach-eligible-events">
      <Box>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {COACH_EVENTS_HEADING}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {COACH_EVENTS_DETAIL}
        </Typography>
      </Box>

      <Alert severity="info" data-testid="coach-events-note">
        {COACH_EVENTS_NOTE}
      </Alert>

      <TextField
        label="Search event"
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        size="small"
        fullWidth
        sx={{ maxWidth: 420 }}
        slotProps={{ htmlInput: { "aria-label": "Search event" } }}
      />

      {events.length === 0 ? (
        <Alert
          severity="info"
          data-testid={filtered ? "coach-events-filter-empty" : "coach-events-empty"}
        >
          {filtered ? COACH_EVENTS_FILTER_EMPTY : COACH_EVENTS_EMPTY}
        </Alert>
      ) : (
        <Stack spacing={1.5} component="ul" sx={{ listStyle: "none", p: 0, m: 0 }}>
          {events.map((event) => (
            <Card key={event.id} variant="outlined" component="li" data-testid="coach-event-row">
              <CardActionArea
                href={`/operate/events/${event.id}/attendance`}
                sx={{ p: 2, minHeight: 44 }}
              >
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {event.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {event.venue ? `${event.when} · ${event.venue}` : event.when}
                </Typography>
              </CardActionArea>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
