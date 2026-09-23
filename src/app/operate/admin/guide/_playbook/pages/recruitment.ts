import { control, screen, state } from "../runs";
import type { PlaybookPage } from "../types";

/**
 * Recruitment — LAN-399.
 *
 * Read off `src/lib/services/recruitment-*`, not off
 * `docs/operating-the-slice.md`, whose §14 still says there is no recruitment
 * intake. There is; it is this. The exit statuses are the code's own literals:
 * Declined, Disengaged and Void, with no "disinterested" anywhere in the
 * application.
 *
 * Step 1 no longer names a re-mint control. Brian, 2026-09-23: the page drops
 * `MINT NEW CODE` while a code is live, so a printed QR cannot be replaced by
 * accident. `content.test.ts` would fail this page for quoting a control that
 * is no longer in `src/`, which is the check working as intended.
 */
export const RECRUITMENT_PAGE: PlaybookPage = {
  slug: "recruitment",
  name: "Recruitment",
  summary: "From the sign-up code to a place on the roster, and the three ways it ends.",
  flowchart: {
    src: "/guide/recruitment.svg",
    alt: "The recruitment flow, from the sign-up code through Identified, Engaged and Committed to Joined, with the three exits to one side.",
    description: [
      ["An operator shows the sign-up code. Somebody scans it and fills in the form."],
      [
        "That creates a recruit at ",
        state("Identified"),
        ". If the consent box was ticked, the welcome and the questionnaires are queued.",
      ],
      [
        "As they answer and the operator records what happened, the status moves to ",
        state("Engaged"),
        " and then ",
        state("Committed"),
        ".",
      ],
      [
        "The flow then ends one of two ways. Confirmed as ",
        state("Joined"),
        ", which creates the season membership and opens onboarding; or exited to ",
        state("Declined"),
        ", ",
        state("Disengaged"),
        " or ",
        state("Void"),
        ", which cancels every message still queued for them.",
      ],
    ],
  },
  steps: [
    {
      operator: [
        "Open ",
        screen("Recruitment"),
        " and then the ",
        screen("Sign-up code"),
        " page. ",
        control("MINT CODE"),
        " issues the season's one code, and is on the page only while there is none. ",
        control("COPY LINK"),
        " copies the same address the code points at.",
      ],
      then: [
        "The code stays live for the season. Nothing on the page replaces it, so what is printed on a poster keeps working.",
      ],
    },
    {
      operator: [
        "A recruit scans the code and fills in ",
        screen("Join the Oxford Lancers"),
        ": first name, last name, mobile number and college email are required, and the WhatsApp consent box has to be ticked before ",
        control("Sign me up"),
        " will save.",
      ],
      then: [
        "A recruit is created at ",
        state("Identified"),
        ", and consent is recorded for this season only.",
      ],
    },
    {
      operator: [
        "For somebody who did not scan anything, use ",
        screen("Add a recruit"),
        ". It asks how their contact details reached the club, and checks for an existing record before it creates one.",
      ],
      then: [
        "A person who already holds a membership for this season is refused: they are a member, not a recruit.",
      ],
    },
    {
      operator: [
        "Watch the board. Each row carries the status and the ",
        control("WhatsApp consent"),
        " value.",
      ],
      then: [
        "With consent, the club sends the welcome and the personal questionnaire. The recruitment questionnaire — the football-background one — is sent only where consent was given on the sign-up form itself.",
      ],
    },
    {
      operator: [
        "Open the recruit's record to send or resend a questionnaire by hand. The ",
        screen("Personal questionnaire"),
        " section has its own button, and so does ",
        screen("Recruitment"),
        "; both confirm with ",
        control("Send"),
        " or ",
        control("Resend"),
        ".",
      ],
      then: ["A resend goes through the same queue as the automatic one. Nothing is sent twice."],
    },
    {
      operator: [
        "Change the status from the board or the record as the conversation moves: ",
        state("Engaged"),
        " once they have answered, ",
        state("Committed"),
        " once they have said they are coming.",
      ],
      then: ["Every change is kept, with who made it and when, in ", screen("Status history"), "."],
    },
    {
      operator: [
        "When they exit, choose ",
        state("Declined"),
        ", ",
        state("Disengaged"),
        " or ",
        state("Void"),
        ". ",
        state("Void"),
        " asks for a ",
        control("Reason"),
        " — it is for a record that should not have existed.",
      ],
      then: [
        "Every queued message for that recruit is cancelled at once: the welcome and questionnaire ladder, and every message hanging off a recruitment-event invitation.",
      ],
    },
    {
      operator: [
        "When they join, choose ",
        state("Joined"),
        " and then ",
        control("Confirm join"),
        ".",
      ],
      then: [
        "One action creates the season membership, opens onboarding, generates the onboarding items, sets availability green, queues the onboarding welcome, and moves them out of the Recruits audience group into Onboarding.",
      ],
    },
  ],
  rules: [
    {
      label: "Consent is required to sign up",
      fact: [
        "The form will not save without the WhatsApp consent box ticked, and the check is on the server as well as the screen.",
      ],
    },
    {
      label: "Consent is one season",
      fact: [
        "It is recorded against the person and this season. Next season it is asked for again.",
      ],
    },
    {
      label: "Joined is not a status you set",
      fact: [
        "Choosing ",
        state("Joined"),
        " opens a confirmation, because it creates a membership. The other six statuses are a straight change.",
      ],
    },
    {
      label: "Any status can follow any status",
      fact: [
        "There is no ladder the application enforces. A recruit can go from ",
        state("Committed"),
        " back to ",
        state("Engaged"),
        ".",
      ],
    },
    {
      label: "An exit cancels queued messages",
      fact: [
        "It does not withdraw consent. Withdrawal stays the person's own act, through the stop link in an email.",
      ],
    },
    {
      label: "Joining keeps event invitations",
      fact: [
        "The flip cancels the recruitment welcome and questionnaire ladder only. An invitation they already hold to a recruitment event still stands.",
      ],
    },
    {
      label: "The duplicate check says nothing",
      fact: [
        "Where the public sign-up form finds an existing record, it asks the person whether they have signed up before. It never shows a name, a number or an address.",
      ],
    },
  ],
  whereToLook: [
    {
      href: "/operate/recruitment",
      label: "Recruitment",
      shows: [
        "The board, filtered by status, consent, ",
        control("Personal sent"),
        ", ",
        control("Recruitment sent"),
        " and ",
        control("Attended an event"),
        ".",
      ],
    },
    {
      href: "/operate/admin/messaging",
      label: "Messaging schedule",
      shows: ["When the welcome and the questionnaires go out, and how often."],
    },
  ],
};
