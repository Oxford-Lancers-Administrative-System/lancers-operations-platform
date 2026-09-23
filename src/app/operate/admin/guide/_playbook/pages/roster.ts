import { control, screen, state } from "../runs";
import type { PlaybookPage } from "../types";

/**
 * Roster — LAN-399.
 *
 * The eight groups below are the board's own `BANDS`, in `BAND_ORDER`. The
 * runbook and `docs/ux/tickets/LAN-186-roster-board.md` both still describe a
 * twenty-column board in three bands; that was true before LAN-374, LAN-375 and
 * LAN-387 rebuilt it, and it is not true now. This page follows the code.
 */
export const ROSTER_PAGE: PlaybookPage = {
  slug: "roster",
  name: "Roster",
  summary: "The season's squad as one board: eight groups of columns, and the two ways in.",
  flowchart: {
    src: "/guide/roster.svg",
    alt: "The roster flow: three ways a player arrives, the board where their season facts are recorded, and the membership statuses.",
    description: [
      [
        "A player arrives one of three ways: added one at a time, carried in by a recruit joining, or loaded from a file. All three open at ",
        state("Onboarding"),
        ".",
      ],
      [
        "The board is where their season facts are recorded — position, groups, special teams, kit, jerseys, availability — in eight groups of columns.",
      ],
      [
        "One of those facts is computed rather than typed: ",
        control("Kit Distributed"),
        " completes itself once five kit items have been issued.",
      ],
      [
        "The membership status moves between ",
        state("Onboarding"),
        ", ",
        state("Active"),
        ", ",
        state("Inactive"),
        ", ",
        state("Departed"),
        " and ",
        state("Archived"),
        ". Any of them can follow any other, and no reason is asked.",
      ],
    ],
  },
  steps: [
    {
      operator: [
        "Open ",
        screen("Roster"),
        ". The heading says which season it is and how many players and columns are showing.",
      ],
      then: [
        "The whole season is read at once. Searching, filtering and sorting happen on what is already on the screen.",
      ],
    },
    {
      operator: [
        "Work through the eight groups of columns: ",
        control("Person"),
        ", ",
        control("Onboarding"),
        ", ",
        control("Membership"),
        ", ",
        control("Coaching assignments"),
        ", ",
        control("Offensive assignments"),
        ", ",
        control("Defensive assignments"),
        ", ",
        control("Special teams assignments"),
        " and ",
        control("Kit"),
        ".",
      ],
      then: [
        "Special teams and Kit start collapsed. Opening or closing a group is remembered against the operator, not the browser, so it follows them to another machine.",
      ],
    },
    {
      operator: [
        "Set the positions. Offence and defence each have a ",
        control("Primary position"),
        " and a ",
        control("Backup position"),
        ", drawn from this season's own list.",
      ],
      then: [
        "Nothing stops the same position being both. One assignment per slot is held at a time, and the previous one is superseded rather than overwritten.",
      ],
    },
    {
      operator: [
        "Set the groups. ",
        control("Offense"),
        ", ",
        control("Defense"),
        " and ",
        control("Special Teams"),
        " are the coaching groups, and a player can be in several.",
      ],
      then: [
        "The position groups are separate: ",
        control("Offensive Line"),
        ", ",
        control("Quarterbacks"),
        ", ",
        control("Runningbacks"),
        " and ",
        control("Wide Receivers"),
        " on offence; ",
        control("Defensive Line"),
        ", ",
        control("Linebackers"),
        " and ",
        control("Defensive Backs"),
        " on defence.",
      ],
    },
    {
      operator: [
        "Fill the special teams. Six squads — ",
        control("Kick Return"),
        ", ",
        control("Kickoff"),
        ", ",
        control("Punt"),
        ", ",
        control("Punt Return"),
        ", ",
        control("Field Goal"),
        " and ",
        control("Field Goal Block"),
        " — each with a starting slot and three backups.",
      ],
      then: ["They are not a depth chart. No rule ties the four slots to each other."],
    },
    {
      operator: [
        "Issue the kit, item by item, and record the two jersey numbers under ",
        control("Blue #"),
        " and ",
        control("White #"),
        ".",
      ],
      then: [
        "A jersey number is unique within the season for each of the two kits. ",
        control("Kit Distributed"),
        " turns itself to complete once the helmet, shoulder pads, lower pads, lowers and practice jersey are all recorded. The mouthguard is deliberately not one of them. A player who owns one of those five themselves is recorded as ",
        control("Player-Owned"),
        ", the last value on each of the five, which counts toward the flag exactly as a size does.",
      ],
    },
    {
      operator: [
        "Record availability as ",
        control("Green"),
        ", ",
        control("Orange"),
        " or ",
        control("Red"),
        ".",
      ],
      then: [
        "It is never overwritten. Each change is a new entry, so the season's history of who was available when is kept.",
      ],
    },
    {
      operator: [
        "To add one returning player, use ",
        screen("Add player"),
        ": first name, last name, email and phone, then ",
        control("Check for matches"),
        ".",
      ],
      then: [
        "Possible matches are shown for the operator to choose from, or to reject with ",
        control("Confirm this is a new person"),
        ". Somebody who already holds a membership for this season is refused.",
      ],
    },
    {
      operator: [
        "To add a squad at once, use ",
        screen("Bulk import players"),
        ": ",
        control("Download the template"),
        ", fill it, then ",
        control("Upload squad file"),
        ".",
      ],
      then: [
        "Nothing is written until the proposal is confirmed. Possible duplicates are answered one at a time with ",
        control("Same person"),
        " or ",
        control("Different person"),
        ".",
      ],
    },
  ],
  rules: [
    {
      label: "The import never deletes anybody",
      fact: [
        "It cannot overwrite a fact the player has confirmed, it cannot send anything, and it cannot create a season. It adds people and queues their welcome.",
      ],
    },
    {
      label: "A stale import is refused",
      fact: [
        "If the roster moved between the proposal and the confirmation, the import refuses rather than applying what it planned against a roster that no longer exists.",
      ],
    },
    {
      label: "A phone number identifies one person",
      fact: [
        "A row whose mobile matches exactly one existing person is treated as that person, not as a possible duplicate.",
      ],
    },
    {
      label: "Kit Distributed is never typed",
      fact: [
        "It is computed from five issued items. Setting it by hand is refused, and the club's own mouthguard is not counted.",
      ],
    },
    {
      label: "Status is not a ladder",
      fact: [
        "Any membership status can follow any other, and no reason is asked. Setting ",
        state("Active"),
        " generates any onboarding items that are missing.",
      ],
    },
    {
      label: "A status change re-checks every future event",
      fact: [
        "A person who becomes eligible is added to the approved events whose audience rule they now match, and one who ceases to be is removed while their messages are still unsent.",
      ],
    },
    {
      label: "Columns are a capability, not a view",
      fact: [
        "An operator without the person-record grant does not get the column emptied. They do not get the column, and the underlying values never reach the page.",
      ],
    },
    {
      label: "A board edit always names its operator",
      fact: ["Every change carries who made it. A write that cannot name one is refused."],
    },
  ],
  whereToLook: [
    {
      href: "/operate/roster",
      label: "Roster",
      shows: ["The whole season, every group of columns, searchable and sortable."],
    },
    {
      href: "/operate/people/missing",
      label: "Missing data",
      shows: ["Which players are short of a required fact, and what is being done about it."],
    },
  ],
};
