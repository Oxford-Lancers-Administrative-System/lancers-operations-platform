import { control, screen, state } from "../runs";
import type { PlaybookPage } from "../types";

/**
 * Messaging — LAN-399.
 *
 * The one page in the playbook that describes work which has not merged. Brian
 * asked on 21 September 2026 for the safety controls to be written up now, "as
 * they will be once PR 195 merges, marked as such"; `notYetMerged` below is
 * that mark, and it is rendered on the page rather than buried in a pull
 * request. Everything else here is read off `src/lib/delivery/**`,
 * `messaging-schedule/**` and `messaging-consent.ts` on this branch.
 */
export const MESSAGING_PAGE: PlaybookPage = {
  slug: "messaging",
  name: "Messaging",
  summary: "Which message goes to whom, on which channel, and what stops one going at all.",
  flowchart: {
    src: "/guide/messaging.svg",
    alt: "The path of one message: the safety check, then the split between a recruit and somebody on the roster, then WhatsApp with email behind it.",
    description: [
      [
        "A message becomes due. If messaging is paused, that person is on hold, or the emergency stop has latched, it waits rather than sends.",
      ],
      [
        "A recruit is checked for this season's consent. Without it, nothing is sent at all. With it, they get one invitation and at most one polite follow-up, and they are never escalated.",
      ],
      [
        "Somebody on the roster is not consent-gated. They get the invitation, the reminders and the email rung, and an escalation to the President if they never answer.",
      ],
      [
        "WhatsApp is tried first. A WhatsApp message that fails outright is followed automatically by the same message on email. Nobody presses anything for that to happen.",
      ],
    ],
  },
  steps: [
    {
      operator: [
        "Set the cadence once. ",
        screen("Messaging schedule"),
        " carries three sections: ",
        screen("Recruitment"),
        ", ",
        screen("Onboarding"),
        " and ",
        screen("Event messaging"),
        ".",
      ],
      then: [
        "Each event type has its own row, with a worked example behind ",
        control("Show an example"),
        " that plays the ladder out for a synthetic event.",
      ],
    },
    {
      operator: ["Nothing, for a recruit who signed up themselves."],
      then: [
        "They receive the welcome and the personal questionnaire. The recruitment questionnaire follows only where consent came from the sign-up form itself.",
      ],
    },
    {
      operator: ["Nothing, for a player on an approved event."],
      then: [
        "They receive the invitation on WhatsApp, then further WhatsApp reminders, then an email reminder, then the escalation goes to the President.",
      ],
    },
    {
      operator: ["Nothing, for a recruit on a recruitment event."],
      then: [
        "They receive one invitation and at most one follow-up. There is no second reminder and no escalation, ever.",
      ],
    },
    {
      operator: [
        "To stop messaging one recruit, open their record and press ",
        control("Stop messages"),
        ". A reason is required.",
      ],
      then: [
        "Consent moves to ",
        state("Withdrawn"),
        " and every message still queued for that person this season is cancelled.",
      ],
    },
    {
      operator: [
        "To record consent somebody gave in person, press ",
        control("Record consent"),
        " on their record and say how it was given.",
      ],
      then: [
        "That authorises the welcome track. It does not authorise the recruitment questionnaire, which needs consent given on the form itself.",
      ],
    },
    {
      operator: [
        "When something looks wrong on one event, open its delivery page and use ",
        control("View diagnostics"),
        ", then ",
        control("Retry delivery"),
        " on the message that failed.",
      ],
      then: ["A retry goes through the same queue. Nothing is sent twice."],
    },
    {
      operator: [
        "When something looks wrong everywhere — nothing sending, or far too much sending — open the ",
        screen("Messaging safety"),
        " section at the foot of ",
        screen("Messaging schedule"),
        " and press ",
        control("Pause messaging"),
        ". A reason is required.",
      ],
      then: [
        "New WhatsApp and email sends stop. Sign-ups and replies are still saved, and a message already in flight may still arrive. ",
        control("Resume messaging"),
        " starts it again.",
      ],
    },
  ],
  rules: [
    {
      label: "Consent is a recruit concept",
      fact: [
        "It is keyed to the person and the season, and it gates recruit messages only. Somebody on the roster is a member of the club and is not consent-gated.",
      ],
    },
    {
      label: "Stop is a recruit concept",
      fact: [
        "A recruit's stop link offers to stop the messages. Somebody on the roster who opens one is told that club messages continue for members, and is offered no button.",
      ],
    },
    {
      label: "The stop link is on email only",
      fact: [
        "A WhatsApp template carrying an opt-out is reclassified by Meta as marketing, so the opt-out line rides on the email instead.",
      ],
    },
    {
      label: "Email is automatic, not a choice",
      fact: [
        "There is no control anywhere that sends a message by email instead. A WhatsApp failure schedules the email itself.",
      ],
    },
    {
      label: "Two ladders, not one",
      fact: [
        "The member's ladder chases and escalates. The recruit's ladder asks once and follows up once.",
      ],
    },
    {
      label: "A schedule change is not retroactive",
      fact: ["Events already approved keep the schedule they were approved with."],
    },
    {
      label: "Pacing is on for everyone",
      fact: [
        "The club's sends are spread across a rolling window, and one person is not sent to more than once every few minutes, whatever queued up behind.",
      ],
    },
    {
      label: "A hold is per person and stays until resumed",
      fact: [
        "Too many messages to one person in a day, or in a week, holds that person alone. Nothing resumes it but an operator.",
      ],
    },
    {
      label: "The emergency stop is durable",
      fact: [
        "It does not clear at midnight, on a restart, or as time passes. Only ",
        control("Resume messaging"),
        " clears it.",
      ],
    },
    {
      label: "Pausing is the core four's",
      fact: [
        "The President, the Vice-President, the Secretary and the General Manager may pause and resume. The IT Officer can read the state and cannot change it.",
      ],
    },
  ],
  whereToLook: [
    {
      href: "/operate/admin/messaging",
      label: "Messaging schedule",
      shows: ["Every cadence, the worked examples, and the safety state."],
    },
    {
      href: "/operate/admin/follow-ups",
      label: "Follow-ups",
      shows: ["What was last sent to each person, and what the delivery did."],
    },
    {
      href: "/operate/people/missing",
      label: "Missing data",
      shows: ["Whether somebody is reachable at all, and why a chase is not scheduled."],
    },
  ],
  notYetMerged: [
    "The ",
    screen("Messaging safety"),
    " section — pacing, per-person holds, the emergency stop, and pause and resume — is described here ahead of its release. Until it ships, ",
    screen("Messaging schedule"),
    " ends at ",
    screen("Event messaging"),
    " and there is no pause control on it. Everything else on this page is live.",
  ],
  // LAN-394, PR 195. Delete each line the day it merges — `content.test.ts`
  // fails on an entry it can find in `src/`, so the list cannot outlive the
  // branch.
  unverifiedClaims: ["Messaging safety", "Pause messaging", "Resume messaging"],
};
