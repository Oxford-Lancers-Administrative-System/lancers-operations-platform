import { control, screen, state } from "../runs";
import type { PlaybookPage } from "../types";

/**
 * Events — LAN-399.
 *
 * Read off `src/lib/services/event-approval/**`, `event-amendment/**`,
 * `event-audience-rule.ts`, `event-audience-amendment.ts` and
 * `messaging-schedule/plan.ts`. Two numbers the guide states are the code's
 * constants, not the runbook's prose: the ten-minute grace before an
 * automatically added invitation leaves, and the five-an-hour cap on those
 * invitations per person. The ladder's own timings are configured per template
 * and are deliberately not quoted as fixed values.
 */
export const EVENTS_PAGE: PlaybookPage = {
  slug: "events",
  name: "Events",
  summary: "Draft, audience, approval, the messaging ladder, attendance, and every kind of change.",
  flowchart: {
    src: "/guide/events.svg",
    alt: "The event flow, from Draft through approval to the invitation, the reminders, the escalation and attendance, with the change branch to one side.",
    description: [
      [
        "An event starts at ",
        state("Draft"),
        ". It cannot be approved until it has a date, a start time, a name and an audience with somebody in it.",
      ],
      [
        "Approval moves it to ",
        state("Approved"),
        " and schedules the whole messaging ladder at once: the invitation, the reminders, the email rung, and the escalation.",
      ],
      [
        "Anybody who has not answered by the deadline is escalated to the President. Once the date has passed, the event reads ",
        state("Occurred"),
        " and attendance is recorded against it.",
      ],
      [
        "An approved event can still be amended, rescheduled or cancelled. Any of those holds every unsent message first, and then either resumes the schedule or cancels it.",
      ],
    ],
  },
  steps: [
    {
      operator: [
        "Open ",
        screen("Events"),
        " and then ",
        screen("Create event"),
        ". Choose the type — it decides which messaging schedule the event will use — and ",
        control("Save draft"),
        ".",
      ],
      then: ["Nothing is sent. A draft is private to the operators."],
    },
    {
      operator: [
        "On the event, choose ",
        control("Choose audience and approve"),
        ". ",
        screen("Build event audience"),
        " offers the groups: ",
        control("Everyone active"),
        ", ",
        control("All active players"),
        ", ",
        control("All active coaches"),
        ", ",
        control("All active committee"),
        ", ",
        control("Onboarding"),
        " and, on a recruitment event, ",
        control("Recruits"),
        ".",
      ],
      then: [
        "Picking a group selects the people in it now. Unticking one person removes them, and that removal is remembered against this event.",
      ],
    },
    {
      operator: [
        "Press the review button — it names how many people are selected — and then ",
        control("Approve event"),
        ".",
      ],
      then: [
        "The audience is frozen. One invitation is minted per person, the response deadline is computed, and the whole ladder is written to the queue.",
      ],
    },
    {
      operator: ["Nothing."],
      then: [
        "The invitation goes on WhatsApp with two buttons, one for yes and one for no. Reminders follow on the schedule for this event's type, then an email rung.",
      ],
    },
    {
      operator: ["Nothing."],
      then: [
        "Anybody still unanswered at the deadline is escalated to whoever holds the President's seat. The escalation carries a count, never a name.",
      ],
    },
    {
      operator: [
        "To let somebody outside the club see the event, use ",
        screen("Event info link"),
        " and press ",
        control("Create the link"),
        ".",
      ],
      then: [
        "The link works until seven days after the event ends, recomputed each time it is opened, so a reschedule revives it.",
      ],
    },
    {
      operator: [
        "To add somebody to an approved event, press ",
        control("Edit event"),
        " and use ",
        screen("Add to audience"),
        ".",
      ],
      then: [
        "They are invited straight away — no grace period — and this is the one route that undoes an earlier unticking.",
      ],
    },
    {
      operator: [
        "To change anything about an approved event, press ",
        control("Edit event"),
        ". The details and the questions are on the one page. Make the change, press ",
        control("Save changes…"),
        ", then ",
        control("Save and notify"),
        " — it names how many hear about it — or ",
        control("Save without notifying"),
        ".",
      ],
      then: [
        "Every unsent message is held while the change is written. If the date or start time moved, the whole schedule is recomputed and then resumed.",
      ],
    },
    {
      operator: [
        "Changing a question's wording sends nobody anything. Changing what it asks voids the answers already given and asks those people again, so the save says how many first — tick ",
        control("This is a correction, keep answers"),
        " if it was only a fix. A question cannot be removed once the event is approved.",
      ],
      then: [
        "Questions and details save together, so nothing is written until the whole save is confirmed.",
      ],
    },
    {
      operator: [
        "To call it off, open ",
        screen("Cancel event"),
        ", give a reason under ",
        control("Why is it off?"),
        ", and choose ",
        control("Tell everyone invited"),
        " or ",
        control("Cancel silently"),
        ".",
      ],
      then: [
        "Every unsent message is cancelled and open non-response flags are resolved. The reason is internal and is never shown to anybody invited.",
      ],
    },
    {
      operator: [
        "On the day, open the event's attendance screen and mark each person ",
        control("Present"),
        ", ",
        control("Late"),
        ", ",
        control("Excused"),
        " or ",
        control("Absent"),
        ". Somebody who turned up uninvited goes in with ",
        control("Add walk-up"),
        ".",
      ],
      then: [
        "The register opens about six hours before the start and never closes. Nobody has to declare that the event happened: a date that has passed and was not cancelled has occurred.",
      ],
    },
  ],
  rules: [
    {
      label: "Approval freezes the audience",
      fact: [
        "It is not re-resolved afterwards. A player who goes inactive after approval keeps their invitation; a recruit who has exited is dropped from the send.",
      ],
    },
    {
      label: "An approved event cannot change type",
      fact: [
        "The type and its template are fixed at approval. Cancel it and draft the other kind of event instead.",
      ],
    },
    {
      label: "An empty audience is refused",
      fact: ["So is an event missing its date, its start time or its name."],
    },
    {
      label: "Late joiners wait ten minutes",
      fact: [
        "Somebody who becomes eligible after approval is added automatically, and their invitation is held for ten minutes so a mistaken status change can be undone before anything leaves.",
      ],
    },
    {
      label: "Five an hour, per person",
      fact: [
        "At most five of those automatic invitations reach one person in any hour. The rest queue behind, one an hour.",
      ],
    },
    {
      label: "Unticking sticks",
      fact: [
        "A person the approver deliberately removed is not added back by the automatic rule. Only a hand-add restores them.",
      ],
    },
    {
      label: "Reschedule moves the schedule, not the audience",
      fact: [
        "The deadline, the invitation expiries and every unsent rung move with the new date. Anything already delivered is never recalled.",
      ],
    },
    {
      label: "Cancellation is final",
      fact: [
        "A cancelled event cannot be amended, re-approved or cancelled again. Nothing is deleted.",
      ],
    },
    {
      label: "A schedule change is not retroactive",
      fact: [
        "Events already approved keep the schedule they were approved with. A change applies to events approved afterwards.",
      ],
    },
  ],
  whereToLook: [
    {
      href: "/operate/events",
      label: "Events",
      shows: [
        "Every event, filtered by ",
        control("Draft"),
        ", ",
        control("Approved"),
        ", ",
        control("Cancelled"),
        " or ",
        control("Occurred"),
        ".",
      ],
    },
    {
      href: "/operate/admin/follow-ups",
      label: "Follow-ups",
      shows: ["Who has not answered, where the chase has got to, and what was escalated."],
    },
    {
      href: "/operate/admin/messaging",
      label: "Messaging schedule",
      shows: ["The ladder for each event type, with a worked example."],
    },
  ],
};
