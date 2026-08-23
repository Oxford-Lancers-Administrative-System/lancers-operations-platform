"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useFilterSearch } from "../filter-search";

/** The badge on a session happening today. */
export const TODAY_CHIP = "Today";

/** Said on a card whose register cannot be opened yet. */
export const NOT_OPEN_YET = "Attendance not open";

/** One event, reduced to what a coach needs to pick the right one. */
export interface CoachEligibleEvent {
  id: string;
  name: string;
  when: string;
  venue: string | null;
  /** Happening today: badged, outlined, and sorted to the top of Upcoming. */
  isToday: boolean;
  /** Its register has opened — D71's buffer, asked of the same function the
   * register itself asks. Nobody asserts anything. */
  isOpen: boolean;
}

/** One dated section of the list. See `./coach-event-buckets.ts` for the rule. */
export interface CoachEligibleSection {
  key: string;
  label: string;
  detail: string;
  events: CoachEligibleEvent[];
}

export const COACH_EVENTS_HEADING = "Attendance";
export const COACH_EVENTS_DETAIL = "This season's sessions";

export const COACH_EVENTS_EMPTY =
  "This season has no approved sessions yet. They appear here as soon as one is approved.";

export const COACH_EVENTS_FILTER_EMPTY =
  "No session matches that search. Clear it to see everything in the season.";

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
  sections,
  search,
  filtered,
}: {
  sections: readonly CoachEligibleSection[];
  search: string;
  filtered: boolean;
}) {
  const total = sections.reduce((count, section) => count + section.events.length, 0);
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

      <TextField
        label="Search event"
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        size="small"
        fullWidth
        sx={{ maxWidth: 420 }}
        slotProps={{ htmlInput: { "aria-label": "Search event" } }}
      />

      {total === 0 ? (
        <Alert
          severity="info"
          data-testid={filtered ? "coach-events-filter-empty" : "coach-events-empty"}
        >
          {filtered ? COACH_EVENTS_FILTER_EMPTY : COACH_EVENTS_EMPTY}
        </Alert>
      ) : (
        sections.map((section) =>
          // An empty section is not drawn. A club practises three times a week
          // for eight months and then stops for the summer, so "Today" is empty
          // far more often than not — and a standing empty heading trains the
          // reader to skip the place the one thing they came for will appear.
          section.events.length === 0 ? null : (
            <Box key={section.key} data-testid={`coach-events-section-${section.key}`}>
              <Typography
                variant="subtitle2"
                component="h2"
                sx={{
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                  color: "text.secondary",
                  fontWeight: 700,
                  mb: 1,
                }}
              >
                {section.label}
              </Typography>
              <Stack spacing={1.5} component="ul" sx={{ listStyle: "none", p: 0, m: 0 }}>
                {section.events.map((event) => (
                  <Card
                    key={event.id}
                    variant="outlined"
                    component="li"
                    data-testid="coach-event-row"
                    data-section={section.key}
                    data-today={event.isToday}
                    data-open={event.isOpen}
                    // The highlight is a property of the **session**, not of the
                    // section it sits in: Upcoming holds the whole rest of the
                    // season, and what a coach is looking for in it is tonight.
                    sx={
                      event.isToday
                        ? { borderColor: "primary.main", borderWidth: 2, bgcolor: "primary.50" }
                        : undefined
                    }
                  >
                    <CardActionArea
                      href={`/operate/events/${event.id}/attendance`}
                      sx={{ p: 2, minHeight: 44 }}
                    >
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{ alignItems: "baseline", flexWrap: "wrap" }}
                      >
                        <Typography variant="body1" sx={{ fontWeight: event.isToday ? 700 : 600 }}>
                          {event.name}
                        </Typography>
                        {event.isToday ? (
                          <Chip size="small" color="primary" label={TODAY_CHIP} />
                        ) : null}
                      </Stack>
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{ alignItems: "baseline", flexWrap: "wrap" }}
                      >
                        <Typography variant="body2" color="text.secondary">
                          {event.venue ? `${event.when} · ${event.venue}` : event.when}
                        </Typography>
                        {/*
                          Said on the card rather than discovered by pressing it.
                          A session whose register has not opened yet gives
                          UX-90, and a coach who taps three of them looking for
                          one they can fill in has learned nothing except that
                          the list is unreliable.
                        */}
                        {event.isOpen ? null : (
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ fontStyle: "italic" }}
                            data-testid="coach-event-not-open"
                          >
                            {NOT_OPEN_YET}
                          </Typography>
                        )}
                      </Stack>
                    </CardActionArea>
                  </Card>
                ))}
              </Stack>
            </Box>
          ),
        )
      )}
    </Stack>
  );
}
