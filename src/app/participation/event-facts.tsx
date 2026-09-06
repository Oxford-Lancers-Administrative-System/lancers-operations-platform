import { Fact, FactGrid } from "@/components/fact";
import { Section } from "@/components/section";
import { Metric, MetricRow } from "@/components/metric";

import { labelFor, TYPE_LABELS } from "@/lib/services/event-vocabulary";
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
 * page.
 *
 * The operator's event page already carries both, and this package does not
 * rebuild it. This is the same information for a reader who has no operator
 * shell around them, rendered from the same payload and the same formatter.
 *
 * **The joining URL is not here, and cannot be.** `ClubLinkEvent` has no such
 * key (REQ-no-joining-url): there is nothing to leave out, which is a stronger
 * guarantee than remembering to.
 *
 * **The type names come from `@/lib/services/event-vocabulary` — R157C-A1.**
 * This file used to hold a private second copy of the seven. `W157-F2` deleted
 * the `TERM_LABELS` half of that duplication and left this half, which is the
 * same defect: byte-identical today, and one renamed or added type away from
 * printing a raw `strength_and_conditioning` to an unauthenticated audience,
 * through the `?? event.eventType` fallback. LAN-153 created that module to
 * stop exactly this, its header says so, and it is pure with no `server-only`,
 * so a client component may hold it — `src/app/e/[token]/page.tsx` already
 * imports from it.
 */

/**
 * `Wednesday, 17 February 2027 · 20:00–22:30`.
 *
 * UX standard 3: a stored calendar date has no time and no zone, so it is read
 * as one — `new Date("2027-02-17T00:00:00Z")` — rather than as an instant, and
 * a value that will not parse says so in words instead of reaching the screen
 * raw or as `Invalid Date`.
 */
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
  const facts: { label: string; value: string }[] = [
    { label: "Type", value: labelFor(TYPE_LABELS, event.eventType) },
    {
      label: online ? "Destination" : "Where",
      value: event.venue ?? (online ? "Online" : ""),
    },
  ];
  if (event.termLabel !== null) {
    // W157-F2. The event page's own formatter, so that the two surfaces say the
    // same words about the same event — `docs/ux/standards.md` rule 7.
    facts.push({
      label: "Term / week",
      value: formatTermAndWeek(event.termLabel, event.weekNumber),
    });
  }
  facts.push({ label: "Attendance", value: event.isMandatory ? "Mandatory" : "Optional" });
  if (event.requiredEquipment) {
    facts.push({ label: "Required equipment", value: event.requiredEquipment });
  }
  if (event.description) facts.push({ label: "Description", value: event.description });

  return (
    <Section title="Details" testId="event-facts">
      <FactGrid>
        {facts.map((fact) => (
          <Fact key={fact.label} label={fact.label} value={fact.value} />
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
