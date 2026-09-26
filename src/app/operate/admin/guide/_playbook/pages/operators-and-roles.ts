import { control, screen, state } from "../runs";
import type { PlaybookPage } from "../types";

/**
 * Operators and roles — LAN-399.
 *
 * This page is the one that carries a table, and the table is generated:
 * `capability-table.tsx` reads `src/lib/auth/capabilities.ts` at render time, so
 * who may do what on this page and who may do what in the application are two
 * readings of one array and cannot disagree. Nothing about the grants is typed
 * into the copy below.
 *
 * It also deliberately does not repeat the existing How administration works
 * page, which answers the procedural questions — how to resend an invitation,
 * what a state means — and keeps its own `role_management` gate. This page is
 * the shape of the workflow; that page is the detail of each act.
 */
export const OPERATORS_AND_ROLES_PAGE: PlaybookPage = {
  slug: "operators-and-roles",
  name: "Operators and roles",
  summary: "Seats, the committee year, invitations, and what each seat is allowed to do.",
  flowchart: {
    src: "/guide/operators-and-roles.svg",
    alt: "The operator flow: invite, invitation email, invitation pending, active, and the routes to deactivated and to a vacant seat.",
    description: [
      [
        "An operator is invited by name, email and at least one role. The invitation cannot be sent without a role.",
      ],
      [
        "An invitation that does not arrive reads ",
        state("Delivery failed"),
        ", and is resent or sent again to a corrected address. One that arrives reads ",
        state("Invitation pending"),
        " until they follow the link and choose their own password.",
      ],
      [
        "From then the account reads ",
        state("Active"),
        ". Access can be taken away and given back without touching the roles the person holds.",
      ],
      [
        "The seat is separate from the account. A role is assigned, replaced or ended on its own, and an ended seat reads ",
        state("Not assigned"),
        ".",
      ],
    ],
  },
  steps: [
    {
      operator: [
        "Open ",
        screen("Operators"),
        " and choose ",
        control("Invite operator"),
        ". The form is three steps: the person, the role, and sending it.",
      ],
      then: [
        "The search runs first. If the club already knows them — including a former player — that record is used rather than a second one being created.",
      ],
    },
    {
      operator: [
        "Choose at least one role, and a start date. Blank means today; a date in the past asks for a reason.",
      ],
      then: [
        "The invitation cannot be sent without a role. A person who already has a login is refused here, with a pointer to their record instead: one person has one login, however many roles they hold.",
      ],
    },
    {
      operator: [control("Send invitation"), "."],
      then: [
        "An email goes to that address with a single-use link. The account reads ",
        state("Invitation pending"),
        " until it is followed.",
      ],
    },
    {
      operator: ["Nothing. They follow the link and choose their own password."],
      then: [
        "Nobody ever sets somebody else's password, and there is no public sign-up. The invitation buys exactly one thing: the chance to set a password.",
      ],
    },
    {
      operator: [
        "If it did not arrive, open their record and use ",
        control("Resend invitation"),
        ", or ",
        control("Correct email and resend"),
        " if the address was wrong.",
      ],
      then: [
        "The invitation stays attached to the same account. The address it went to before is kept in the record rather than quietly overwritten.",
      ],
    },
    {
      operator: [
        "To stop somebody signing in, use ",
        control("Deactivate operator access"),
        " with a reason. To let them back in, ",
        control("Restore operator access"),
        ".",
      ],
      then: [
        "Deactivating ends no role and leaves no seat vacant. Restoring brings back only the roles still in effect.",
      ],
    },
    {
      operator: [
        "To move a seat, open ",
        screen("Roles"),
        " and the role, then ",
        control("Assign role"),
        ", ",
        control("Replace role"),
        " or ",
        control("End role"),
        ".",
      ],
      then: [
        "They are three different facts, not one form with an optional successor. Both sides of a replacement stay in the club's history, and neither is rewritten.",
      ],
    },
    {
      operator: [
        "Open the role and set the seat's ",
        screen("Access"),
        ": None, View or Edit on each roster and recruiting category, None, View or Manage on each event template, and Yes or No on adding players and adding recruits. ",
        control("Copy access from another seat"),
        " and ",
        control("Grant everything"),
        " fill it in one step.",
      ],
      then: [
        "Events and the roster are granted per seat there. The table below is the fixed actions only, generated from the same list the application enforces from.",
      ],
    },
  ],
  rules: [
    {
      label: "One person, one login",
      fact: [
        "Roles are added to the login they already have. A second account is never created for a second role.",
      ],
    },
    {
      label: "The committee year is a label",
      fact: [
        "Committee seats hang off it and coaching seats hang off the season. Opening the next committee year is not done in the application.",
      ],
    },
    {
      label: "An undecided grant refuses everybody",
      fact: [
        "A capability with no seats on it is refused to every operator, the President included. Absence of a decision is never permission.",
      ],
    },
    {
      label: "Nobody acts on their own account",
      fact: [
        "An operator cannot end their own role, deactivate themselves, or recover their own address.",
      ],
    },
    {
      label: "Two seats are protected",
      fact: [
        "The General Manager's seat and the President's seat are not ordinary administration. Who may act on each is a named, short list.",
      ],
    },
    {
      label: "Navigation is not permission",
      fact: [
        "Hiding a link grants and revokes nothing. Every privileged action checks for itself when it runs.",
      ],
    },
    {
      label: "A refusal names the requirement",
      fact: [
        "It says what the action needs. It never lists what the reader holds, and never says who does hold the missing grant.",
      ],
    },
  ],
  whereToLook: [
    {
      href: "/operate/admin/operators",
      label: "Operators",
      shows: [
        "Every account, grouped by ",
        control("Standing Officers"),
        ", ",
        control("Club Officers"),
        " and ",
        control("Coaches"),
        ".",
      ],
    },
    {
      href: "/operate/admin/roles",
      label: "Roles",
      shows: ["Every seat, who holds it now, and what it carries."],
    },
    {
      href: "/operate/admin/guide",
      label: "How administration works",
      shows: [
        "The step-by-step answers for each administrative act, and what each account state means.",
      ],
    },
  ],
};
