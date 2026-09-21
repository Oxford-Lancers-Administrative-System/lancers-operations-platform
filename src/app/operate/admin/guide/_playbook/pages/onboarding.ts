import { control, screen, state } from "../runs";
import type { PlaybookPage } from "../types";

/**
 * Onboarding — LAN-399.
 *
 * Read off `src/lib/services/player-questionnaire/**`, `membership/write-items.ts`
 * and `onboarding-chase/**`. The five questionnaire steps are the code's own
 * `STEP_ORDER`; the derived items are the three `isDerivedItem()` names.
 */
export const ONBOARDING_PAGE: PlaybookPage = {
  slug: "onboarding",
  name: "Onboarding",
  summary: "What the player answers, what the operator records, and what makes them Active.",
  flowchart: {
    src: "/guide/onboarding.svg",
    alt: "The onboarding flow, from arrival through the welcome and the five questionnaire steps to Active, with the chase and the escalation to one side.",
    description: [
      [
        "A person arrives at ",
        state("Onboarding"),
        " one of three ways: a recruit joins, an operator adds a returning player, or a file is imported. All three queue the same welcome.",
      ],
      [
        "The welcome carries a private link to the questionnaire: their details, the Code of Conduct, the photo release, BUCS Play and Hudl, in that order.",
      ],
      [
        "While anything is outstanding, the club chases them on a schedule, up to a set number of times. When that count is spent, one escalation goes to the President with a count and no names.",
      ],
      [
        "The operator records the items the club owns. When everything needed is there, the operator sets the membership to ",
        state("Active"),
        ".",
      ],
    ],
  },
  steps: [
    {
      operator: [
        "Confirm the arrival. A recruit confirmed as ",
        state("Joined"),
        " arrives automatically; a returning player is added on ",
        screen("Add player"),
        "; a squad is added on ",
        screen("Bulk import players"),
        ".",
      ],
      then: [
        "The membership opens at ",
        state("Onboarding"),
        ", the season's onboarding items are generated, and the onboarding welcome is queued.",
      ],
    },
    {
      operator: ["Nothing. The player works through their own form from the link in that message."],
      then: [
        "Step one is ",
        screen("Your details"),
        " — who they are, where they study, the private fields and an emergency contact — and carries the season's messaging consent box.",
      ],
    },
    {
      operator: ["Nothing."],
      then: [
        "Step two is ",
        screen("The Code of Conduct"),
        ": they read it and agree. Step three is ",
        screen("The photo release"),
        ", on the University's own wording.",
      ],
    },
    {
      operator: ["Nothing."],
      then: [
        "Step four is ",
        screen("Register on BUCS Play"),
        " and step five is ",
        screen("Get into Hudl"),
        ". Each asks them to do it and then tell the club they have.",
      ],
    },
    {
      operator: [
        "Open the player's roster record and set the items the club owns: ",
        control("Sub invoiced"),
        ", ",
        control("Sub paid"),
        ", ",
        control("BUCS Play"),
        ", ",
        control("Hudl access"),
        ", ",
        control("Squad photo"),
        " and ",
        control("Comms group"),
        ".",
      ],
      then: [
        "Each item carries its own short list of states. Nothing else is offered, so an item cannot be set to a value it does not have.",
      ],
    },
    {
      operator: ["Leave the derived items alone. The application refuses to set them by hand."],
      then: [
        control("Kit Distributed"),
        " completes itself once five kit items have been issued. Contact and academic details complete once every required field and the emergency contact are present. Season welcome and consent completes once consent is granted.",
      ],
    },
    {
      operator: [
        "Open ",
        screen("Missing data"),
        " to see who is still short, and press ",
        control("Nudge"),
        " for one person or several.",
      ],
      then: [
        "A nudge sends the same outstanding-items link the automatic chase sends, and it is not counted against the chase limit.",
      ],
    },
    {
      operator: [
        "When they are ready, set the membership status to ",
        state("Active"),
        " on the roster.",
      ],
      then: [
        "The onboarding items are regenerated if any are missing, and the person moves out of the Onboarding audience group.",
      ],
    },
  ],
  rules: [
    {
      label: "One welcome, always",
      fact: [
        "Everybody who arrives gets it, before any consent question arises. The only refusal is somebody who has already declined contact.",
      ],
    },
    {
      label: "The chase has a cap",
      fact: [
        "It is set on ",
        screen("Messaging schedule"),
        ": how long after joining the first one goes, how many times to ask, and how many days apart.",
      ],
    },
    {
      label: "Only a delivered chase counts",
      fact: [
        "A message that failed does not spend one of the attempts. A message that arrived does, including an operator's nudge.",
      ],
    },
    {
      label: "Under 18 is never chased",
      fact: [
        "The application reads a derived flag, never the date of birth itself, and holds the chase.",
      ],
    },
    {
      label: "No usable number, no chase",
      fact: [
        "The queue and the send path ask the same function for a number, so what the screen offers and what the club can send never disagree.",
      ],
    },
    {
      label: "Subs paid follows subs invoiced",
      fact: [
        control("Sub paid"),
        " cannot be recorded until ",
        control("Sub invoiced"),
        " is complete.",
      ],
    },
    {
      label: "Derived items are never typed",
      fact: [
        "Three of them are computed from other facts. Setting one by hand is refused rather than quietly ignored.",
      ],
    },
    {
      label: "Status is not a ladder",
      fact: [
        "A membership can be set to any status at any time, and no reason is asked. ",
        state("Active"),
        " is a decision the operator takes, not a threshold the application crosses.",
      ],
    },
  ],
  whereToLook: [
    {
      href: "/operate/people/missing",
      label: "Missing data",
      shows: ["Who is short of what, when they were last contacted, and what is scheduled next."],
    },
    {
      href: "/operate/roster",
      label: "Roster",
      shows: ["The ", control("Onboarding"), " group of columns, for the whole squad at once."],
    },
    {
      href: "/operate/admin/messaging",
      label: "Messaging schedule",
      shows: ["The chase timing and how many times it asks."],
    },
  ],
};
