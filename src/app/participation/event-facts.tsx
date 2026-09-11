import { Fact, FactGrid } from "@/components/fact";
import { Section } from "@/components/section";
import { Metric, MetricRow } from "@/components/metric";

import type { ClubLinkEvent, ParticipationHeadline } from "@/lib/services/participation-view";

import {
  formatShowedAgainstInvited,
  formatTermAndWeek,
  HEADLINE_INVITED_LABEL,
  HEADLINE_SAID_YES_LABEL,
  HEADLINE_SHOWED_LABEL,
} from "./presentation";

/**
 * The event's own details, and the three headline numbers — for the club-link
 * page. Same payload and formatter as the operator's event page. The joining
 * URL cannot be here: `ClubLinkEvent` has no such key (REQ-no-joining-url).
 * Type names come from `@/lib/services/event-vocabulary` (R157C-A1), not a
 * private second copy, so a renamed type can't leak raw to an unauthenticated
 * audience.
 *
 * Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE
 */

/** UX standard 3: a stored calendar date has no zone, read as one; an unparseable value says so in words. */
export function formatEventWhen(event: {
  scheduledOn: string | null;
  startsAt: string | null;
  endsAt: string | null;
}): string {
  if (event.scheduledOn === null) return "No date set";
  const day = new Date(`${event.scheduledOn}T00:00:00Z`);
  if (Number.isNaN(day.getTime())) return "No date set";
  const date = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(day);
  const time = (value: string | null) => (value === null ? null : value.slice(0, 5));
  const from = time(event.startsAt);
  const to = time(event.endsAt);
  if (from === null) return date;
  return to === null ? `${date} · ${from}` : `${date} · ${from}–${to}`;
}

export function EventFacts({ event }: { event: ClubLinkEvent }) {
  const online = event.deliveryMode === "online";
  // LAN-264: `multiline` marks free text the operator typed, so a three-line entry reads as three lines here too.
  const facts: { label: string; value: string; multiline?: boolean }[] = [
    { label: "Type", value: event.templateName },
    {
      label: online ? "Destination" : "Where",
      value: event.venue ?? (online ? "Online" : ""),
    },
  ];
  if (event.termLabel !== null) {
    // W157-F2. The event page's own formatter, so both surfaces say the same words (rule 7).
    facts.push({
      label: "Term / week",
      value: formatTermAndWeek(event.termLabel, event.weekNumber),
    });
  }
  facts.push({ label: "Attendance", value: event.isMandatory ? "Mandatory" : "Optional" });
  if (event.requiredEquipment) {
    facts.push({
      label: "Required equipment",
      value: event.requiredEquipment,
      multiline: true,
    });
  }
  if (event.description) {
    facts.push({ label: "Description", value: event.description, multiline: true });
  }

  return (
    <Section title="Details" testId="event-facts">
      <FactGrid>
        {facts.map((fact) => (
          <Fact
            key={fact.label}
            label={fact.label}
            value={fact.value}
            multiline={fact.multiline ?? false}
          />
        ))}
      </FactGrid>
    </Section>
  );
}

export function HeadlineNumbers({ headline }: { headline: ParticipationHeadline }) {
  const numbers: { label: string; value: string; testId: string }[] = [
    { label: HEADLINE_INVITED_LABEL, value: String(headline.invited), testId: "headline-invited" },
    {
      label: HEADLINE_SAID_YES_LABEL,
      value: String(headline.saidYes),
      testId: "headline-said-yes",
    },
    {
      label: `${HEADLINE_SHOWED_LABEL} / ${HEADLINE_INVITED_LABEL}`,
      value: formatShowedAgainstInvited(headline),
      testId: "headline-showed",
    },
  ];

  return (
    <MetricRow testId="headline-numbers">
      {numbers.map((number) => (
        <Metric
          key={number.label}
          label={number.label}
          value={number.value}
          testId={number.testId}
        />
      ))}
    </MetricRow>
  );
}
