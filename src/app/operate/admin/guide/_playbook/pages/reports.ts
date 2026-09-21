import { control, screen } from "../runs";
import type { PlaybookPage } from "../types";

/**
 * Reports — LAN-399.
 *
 * The Monday report is a **stored snapshot**, not a live query, and that is the
 * one fact on this page an operator has to hold: two people opening the same
 * date see the same report, and a report filed last week does not change
 * because the roster did. Read off `src/lib/services/weekly-report/**` and
 * `src/app/operate/report/**`.
 */
export const REPORTS_PAGE: PlaybookPage = {
  slug: "reports",
  name: "Reports",
  summary: "The Monday report, the two queues it sends you to, and what each one reads from.",
  flowchart: {
    src: "/guide/reports.svg",
    alt: "The reporting flow: a week of activity, the Monday report filed as a snapshot, and the two queues it leads to.",
    description: [
      [
        "A week of events, answers and attendance accumulates. Nothing is computed until somebody asks for it.",
      ],
      [
        "Opening the report for a date and pressing the button files a snapshot for that date. Arriving, sorting and refreshing do not file anything.",
      ],
      [
        "The report is eight sections. Two of them lead somewhere: what is still outstanding leads to the missing-data queue, and who has not answered leads to the follow-ups queue.",
      ],
      [
        "From those queues an operator nudges or chases. An escalation to the President is automatic, at the event's own deadline, and carries no names.",
      ],
    ],
  },
  steps: [
    {
      operator: [
        "Open ",
        screen("Report"),
        ". It opens on today's date in the club's own time zone.",
      ],
      then: ["What is shown is the snapshot already filed for that date, if there is one."],
    },
    {
      operator: [
        "To file a new one, set the ",
        control("Reporting date"),
        " and press ",
        control("Show report"),
        ".",
      ],
      then: [
        "That is the only action that files a snapshot. Sorting a grid or refreshing the page leaves the filed report exactly as it was.",
      ],
    },
    {
      operator: [
        "Read the sections in order: ",
        screen("Last week's events"),
        ", ",
        screen("Attendance"),
        ", ",
        screen("Availability"),
        ", ",
        screen("Next week"),
        ", ",
        screen("Walk-ups"),
        ", ",
        screen("Recruitment"),
        ", ",
        screen("Onboarding still outstanding"),
        " and ",
        screen("The week in numbers"),
        ".",
      ],
      then: [
        "An empty section says so rather than disappearing — nothing scheduled, nobody outstanding, everybody available.",
      ],
    },
    {
      operator: [
        "Take ",
        screen("Onboarding still outstanding"),
        " to ",
        screen("Missing data"),
        " and nudge the people on it.",
      ],
      then: [
        "A nudge sends the same outstanding-items link the automatic chase sends, and does not spend one of the chase attempts.",
      ],
    },
    {
      operator: [
        "Take the people who have not answered to ",
        screen("Follow-ups"),
        ", and use ",
        control("Chase 1 person"),
        " — the count is whoever is selected.",
      ],
      then: [
        "The queue shows what the club last sent each person and on which channel, so a second operator does not chase somebody who has just been chased.",
      ],
    },
    {
      operator: ["Nothing, for the escalation."],
      then: [
        "It goes automatically to whoever holds the President's seat at the event's response deadline, carrying a count and never a name.",
      ],
    },
    {
      operator: [
        "If the row reads ",
        control("Escalation held: no President in post"),
        ", fill the seat.",
      ],
      then: [
        "A vacant office holds the escalation visibly rather than sending it somewhere else or dropping it.",
      ],
    },
  ],
  rules: [
    {
      label: "The report is a snapshot",
      fact: [
        "It is stored for a date, not recomputed on each visit. Two people opening the same date read the same report.",
      ],
    },
    {
      label: "Only one action files one",
      fact: [control("Show report"), ". Arriving, sorting and refreshing file nothing."],
    },
    {
      label: "The report is the core four's and the IT Officer's",
      fact: ["Nobody else sees it, and a coaching seat never does."],
    },
    {
      label: "The queues are live",
      fact: [
        "Unlike the report, the missing-data and follow-ups queues are computed when they are opened.",
      ],
    },
    {
      label: "An escalation carries no personal data",
      fact: ["A count of who is outstanding, and a link. No names."],
    },
    {
      label: "Nothing chases by itself outside the ladders",
      fact: [
        "The queues show what is outstanding. The automatic chases are the event ladder and the onboarding chase, both configured on the messaging schedule.",
      ],
    },
  ],
  whereToLook: [
    {
      href: "/operate/report",
      label: "Report",
      shows: ["The week, by date, as it was filed."],
    },
    {
      href: "/operate/people/missing",
      label: "Missing data",
      shows: ["Everybody short of a required fact, and what is scheduled next for them."],
    },
    {
      href: "/operate/admin/follow-ups",
      label: "Follow-ups",
      shows: ["Everybody outstanding on an approved event, and where the chase has got to."],
    },
  ],
};
