"use client";

import { useCallback } from "react";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Field } from "@/components/field";
import { EmptyState } from "@/components/empty-state";
import { RowCard, RowCardList } from "@/components/row-card";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
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
      <PageHeader title={COACH_EVENTS_HEADING} subtitle={COACH_EVENTS_DETAIL} />

      <Field
        label="Search event"
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        sx={{ maxWidth: 420 }}
        slotProps={{ htmlInput: { "aria-label": "Search event" } }}
      />

      {total === 0 ? (
        <EmptyState
          title={filtered ? COACH_EVENTS_FILTER_EMPTY : COACH_EVENTS_EMPTY}
          searched={filtered ? search : undefined}
          action={filtered ? { href: "/operate/events", label: "Clear search" } : undefined}
          testId={filtered ? "coach-events-filter-empty" : "coach-events-empty"}
        />
      ) : (
        sections.map((section) =>
          // An empty section is not drawn. A club practises three times a week
          // for eight months and then stops for the summer, so "Today" is empty
          // far more often than not — and a standing empty heading trains the
          // reader to skip the place the one thing they came for will appear.
          section.events.length === 0 ? null : (
            <Box key={section.key} data-testid={`coach-events-section-${section.key}`}>
              <Section title={section.label}>
                <RowCardList component="ul" at="all">
                  {section.events.map((event) => (
                    <Box
                      component="li"
                      key={event.id}
                      data-testid="coach-event-row"
                      data-section={section.key}
                      data-today={event.isToday}
                      data-open={event.isOpen}
                    >
                      <RowCard
                        title={event.name}
                        href={`/operate/events/${event.id}/attendance`}
                        emphasized={event.isToday}
                        trailing={event.isToday ? TODAY_CHIP : undefined}
                        sublines={[
                          event.venue ? `${event.when} · ${event.venue}` : event.when,
                          ...(event.isOpen
                            ? []
                            : [
                                <Typography
                                  component="span"
                                  key="not-open"
                                  variant="body2"
                                  data-testid="coach-event-not-open"
                                >
                                  {NOT_OPEN_YET}
                                </Typography>,
                              ]),
                        ]}
                      />
                    </Box>
                  ))}
                </RowCardList>
              </Section>
            </Box>
          ),
        )
      )}
    </Stack>
  );
}
