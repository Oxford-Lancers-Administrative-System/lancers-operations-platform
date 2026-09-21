import { control, screen } from "../runs";
import type { PlaybookPage } from "../types";

/**
 * People and data — LAN-399.
 *
 * The one page whose subject is the club's obligations rather than its
 * operations, so it is also the one where a paraphrase does real harm. Every
 * sentence about erasure is read off `src/lib/services/person-erasure/**`, and
 * the promises quoted from the privacy notice are quoted, not summarised.
 */
export const PEOPLE_AND_DATA_PAGE: PlaybookPage = {
  slug: "people-and-data",
  name: "People and data",
  summary:
    "One record per person: what is missing, what is duplicated, and what happens when somebody asks to be removed.",
  flowchart: {
    src: "/guide/people-and-data.svg",
    alt: "The person-record flow: the missing-data check, the duplicate check, and the two-signature route to an anonymised record.",
    description: [
      [
        "Every person the club knows has one record. What it shows depends on the reader: an operator without the person-record grant is not shown the restricted fields at all.",
      ],
      [
        "A record short of something the club needs appears on the missing-data queue, where it is corrected or the person is nudged for it.",
      ],
      [
        "Two records for one person are merged, difference by difference. Nothing is deleted: the losing record is kept, dated, and points at the survivor.",
      ],
      [
        "When somebody asks to be removed, two people from the core four each confirm it as separate acts. The second confirmation carries it out in the same moment, so nobody is ever half-erased.",
      ],
    ],
  },
  steps: [
    {
      operator: [
        "Open ",
        screen("People"),
        " and then the person. The record is one page: who they are, how to reach them, what they study, the restricted fields, their seasons and their history.",
      ],
      then: [
        "Date of birth and emergency contact are the restricted category. They are absent from the page for a reader without the grant, not merely hidden on it.",
      ],
    },
    {
      operator: [
        "Open ",
        screen("Missing data"),
        " to see who is short of something. Use ",
        control("Correct"),
        " to fill it in, or ",
        control("Nudge"),
        " to ask them for it.",
      ],
      then: [
        "What counts as required depends on who they are. A recruit needs a college email; a player needs that and the academic fields, the date of birth and an emergency contact.",
      ],
    },
    {
      operator: [
        "When two records are one person, open the surviving record and choose to merge. ",
        screen("Merge two records"),
        " searches by name or alias, and ",
        control("Compare"),
        " opens the comparison.",
      ],
      then: [
        "The record the operator came from survives by default. ",
        control("Make this the survivor"),
        " swaps them.",
      ],
    },
    {
      operator: [
        "Answer every difference, give a reason under ",
        screen("Why"),
        ", and press ",
        control("Merge"),
        ".",
      ],
      then: [
        "The button stays disabled while anything is unanswered, and the server refuses the merge as well — an unanswered disagreement is never taken as a vote for the survivor.",
      ],
    },
    {
      operator: [
        "When somebody asks for a copy of what the club holds, press ",
        control("Export everything held about this person"),
        " on their record.",
      ],
      then: [
        "A file downloads to the operator's own machine. The platform keeps no copy of it: it is the club's to hand over.",
      ],
    },
    {
      operator: [
        "When somebody asks to be removed, check the four things that block it: a live recruitment record, a place on an open roster, a live operator account, and a seat still held.",
      ],
      then: [
        "Each one names what has to happen first. A live recruit has to be voided, declined or disengaged; a player has to be departed from the roster.",
      ],
    },
    {
      operator: [
        "Press ",
        control("Anonymise this person"),
        ", record the ",
        control("Date they asked"),
        ", and confirm. Then a second person from the core four opens the same record and confirms.",
      ],
      then: [
        "The first confirmation waits. The second carries the anonymisation out in the same transaction, and the record of who confirmed goes with it — the audit event is what remains.",
      ],
    },
  ],
  rules: [
    {
      label: "Erasure is anonymisation",
      fact: [
        "The name, the contact details and the date of birth go. Attendance, responses and agreements stay, pointing at a record with no name on it.",
      ],
    },
    {
      label: "It cannot be undone",
      fact: ["There is no restore, and no copy is kept anywhere for one."],
    },
    {
      label: "Two people, not two clicks",
      fact: [
        "The President and the General Manager are asked for first. Where one person holds both seats, the second confirmation comes from the Vice-President or the Secretary instead.",
      ],
    },
    {
      label: "The IT Officer cannot do this",
      fact: [
        "It is the one privileged action the administrative seat does not hold. The seat that keeps the system running is not the seat that decides a person stops existing in it.",
      ],
    },
    {
      label: "A merge deletes nothing",
      fact: [
        "The losing record is kept, dated, and points at the survivor, so a message that reached the wrong record can still be traced.",
      ],
    },
    {
      label: "A merge never grants a login",
      fact: [
        "Operator accounts and seats are deliberately not carried across. A record holding a live seat has to have it ended first.",
      ],
    },
    {
      label: "The controller is the University",
      fact: [
        "The privacy notice names the University of Oxford as the data controller and the General Manager as the club's privacy contact.",
      ],
    },
    {
      label: "The club has one month",
      fact: [
        "That is what the privacy notice promises for a request, and a request has to come from a contact already on the record or be verified with an officer in person.",
      ],
    },
    {
      label: "Nothing deletes itself",
      fact: [
        "The retention periods in the privacy notice are the club's policy, carried out by an officer. The platform deletes nothing on a timer.",
      ],
    },
  ],
  whereToLook: [
    {
      href: "/operate/people",
      label: "People",
      shows: ["Every person the club knows, and the route into one record."],
    },
    {
      href: "/operate/people/missing",
      label: "Missing data",
      shows: ["Everybody short of a required fact, most-missing first."],
    },
    {
      href: "/privacy",
      label: "Privacy notice",
      shows: [
        "What the club promises: the controller, the processors, the retention and the rights.",
      ],
    },
  ],
};
