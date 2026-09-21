/**
 * The eight flowcharts, as specifications — LAN-399.
 *
 * Every box and every arrow here was read off the service layer, not off
 * `docs/operating-the-slice.md`: where the two disagreed, the code won and the
 * disagreement is recorded in the pull request. The drawings are deliberately
 * coarse. A flowchart that reproduced every guard in `event-approval/write.ts`
 * would be a second copy of the code, and would be wrong within a month; what
 * an operator needs from a picture is the shape of the flow, which state comes
 * next, where a message leaves the club, and where the flow can end. The exact
 * refusals live in the steps and the rules beneath each drawing.
 *
 * `renderFlowchart()` turns each of these into `public/guide/<slug>.svg`, and
 * `flowchart.test.ts` holds the committed file to it.
 */
import type { FlowDiagram } from "./flowchart";

export const RECRUITMENT_DIAGRAM: FlowDiagram = {
  title: "How a recruit becomes a member",
  nodes: [
    { id: "code", shape: "operator", label: ["Show the sign-up code"], col: 0, row: 0 },
    { id: "identified", shape: "state", label: ["Identified"], col: 0, row: 1 },
    {
      id: "welcome",
      shape: "message",
      label: ["Welcome, then the", "questionnaires"],
      col: 0,
      row: 2,
    },
    { id: "engaged", shape: "state", label: ["Engaged"], col: 0, row: 3 },
    { id: "committed", shape: "state", label: ["Committed"], col: 0, row: 4 },
    { id: "join", shape: "decision", label: ["Do they join?"], col: 0, row: 5 },
    { id: "joined", shape: "state", label: ["Joined"], col: 0, row: 6 },
    {
      id: "onboarding",
      shape: "automatic",
      label: ["Membership created;", "Onboarding opens"],
      col: 0,
      row: 7,
    },
    { id: "exit", shape: "exit", label: ["Declined, Disengaged", "or Void"], col: 1, row: 5 },
    {
      id: "cancelled",
      shape: "automatic",
      label: ["Queued messages", "cancelled"],
      col: 1,
      row: 6,
    },
  ],
  edges: [
    { from: "code", to: "identified", label: ["They scan it", "and fill it in"] },
    { from: "identified", to: "welcome", label: ["Consent ticked"] },
    { from: "welcome", to: "engaged", label: ["They answer"] },
    { from: "engaged", to: "committed", label: ["Operator sets", "the status"] },
    { from: "committed", to: "join" },
    { from: "joined", to: "onboarding", label: ["Automatic"] },
    { from: "join", to: "joined", label: ["Yes — operator", "confirms"] },
    { from: "join", to: "exit", label: ["No"], route: "across" },
    { from: "exit", to: "cancelled", label: ["Automatic"] },
  ],
};

export const ONBOARDING_DIAGRAM: FlowDiagram = {
  title: "How a new member becomes Active",
  nodes: [
    {
      id: "arrive",
      shape: "automatic",
      label: ["Recruit joins, player", "added, or file imported"],
      col: 0,
      row: 0,
    },
    { id: "onboarding", shape: "state", label: ["Onboarding"], col: 0, row: 1 },
    { id: "welcome", shape: "message", label: ["Onboarding welcome"], col: 0, row: 2 },
    {
      id: "steps",
      shape: "state",
      label: ["Five steps: details,", "Code of Conduct, photo", "release, BUCS Play, Hudl"],
      col: 0,
      row: 3,
    },
    { id: "outstanding", shape: "decision", label: ["Anything outstanding?"], col: 0, row: 4 },
    { id: "chase", shape: "message", label: ["Chase"], col: 1, row: 4 },
    { id: "escalate", shape: "message", label: ["Escalation to", "the President"], col: 2, row: 4 },
    {
      id: "items",
      shape: "operator",
      label: ["Operator resolves the", "onboarding items"],
      col: 0,
      row: 5,
    },
    { id: "active", shape: "state", label: ["Active"], col: 0, row: 6 },
  ],
  edges: [
    { from: "arrive", to: "onboarding" },
    { from: "onboarding", to: "welcome", label: ["Automatic"] },
    { from: "welcome", to: "steps", label: ["Link in the message"] },
    { from: "steps", to: "outstanding" },
    { from: "outstanding", to: "chase", label: ["Yes"], route: "across" },
    { from: "chase", to: "steps", label: ["Until the cap"], route: "around-right" },
    { from: "chase", to: "escalate", label: ["Cap spent"], route: "across" },
    { from: "outstanding", to: "items", label: ["No"] },
    { from: "items", to: "active", label: ["Operator sets", "Active"] },
  ],
};

export const EVENTS_DIAGRAM: FlowDiagram = {
  title: "How an event is approved, messaged and recorded",
  nodes: [
    { id: "draft", shape: "state", label: ["Draft"], col: 0, row: 0 },
    {
      id: "complete",
      shape: "decision",
      label: ["Date, time, name,", "audience?"],
      col: 0,
      row: 1,
    },
    { id: "refused", shape: "exit", label: ["Refused"], col: 1, row: 1 },
    { id: "approved", shape: "state", label: ["Approved"], col: 0, row: 2 },
    {
      id: "change",
      shape: "operator",
      label: ["Amend, reschedule", "or cancel"],
      col: 2,
      row: 2,
    },
    {
      id: "held",
      shape: "automatic",
      label: ["Unsent messages held,", "then resumed", "or cancelled"],
      col: 2,
      row: 3,
    },
    { id: "invitation", shape: "message", label: ["Invitation"], col: 0, row: 3 },
    {
      id: "reminders",
      shape: "message",
      label: ["Reminders, then the", "email rung"],
      col: 0,
      row: 4,
    },
    { id: "answered", shape: "decision", label: ["Answered by the", "deadline?"], col: 0, row: 5 },
    {
      id: "escalation",
      shape: "message",
      label: ["Escalation to", "the President"],
      col: 1,
      row: 5,
    },
    { id: "occurred", shape: "state", label: ["Occurred"], col: 0, row: 6 },
    { id: "attendance", shape: "operator", label: ["Record attendance"], col: 1, row: 6 },
  ],
  edges: [
    { from: "draft", to: "complete" },
    { from: "complete", to: "refused", label: ["Something", "missing"], route: "across" },
    { from: "complete", to: "approved", label: ["Operator approves"] },
    { from: "approved", to: "change", route: "across" },
    { from: "change", to: "held", label: ["Automatic"] },
    { from: "approved", to: "invitation", label: ["Automatic"] },
    { from: "invitation", to: "reminders", label: ["On the", "schedule"] },
    { from: "reminders", to: "answered" },
    { from: "answered", to: "escalation", label: ["No"], route: "across" },
    { from: "answered", to: "occurred", label: ["Yes"] },
    { from: "occurred", to: "attendance", route: "across" },
  ],
};

export const MESSAGING_DIAGRAM: FlowDiagram = {
  title: "How one message reaches one person",
  nodes: [
    { id: "due", shape: "automatic", label: ["A message becomes due"], col: 1, row: 0 },
    {
      id: "safety",
      shape: "decision",
      label: ["Paused, held or", "stopped?"],
      col: 1,
      row: 1,
    },
    { id: "waits", shape: "exit", label: ["Waits until resumed"], col: 2, row: 1 },
    {
      id: "who",
      shape: "decision",
      label: ["Recruit, or on", "the roster?"],
      col: 1,
      row: 2,
    },
    { id: "consent", shape: "decision", label: ["Consent this season?"], col: 0, row: 3 },
    { id: "nothing", shape: "exit", label: ["Nothing is sent"], col: 0, row: 4 },
    {
      id: "member",
      shape: "message",
      label: ["Invitation, reminders,", "email rung"],
      col: 2,
      row: 3,
    },
    {
      id: "escalation",
      shape: "message",
      label: ["Escalation to", "the President"],
      col: 2,
      row: 4,
    },
    {
      id: "recruit",
      shape: "message",
      label: ["Invitation, then one", "polite follow-up"],
      col: 1,
      row: 4,
    },
    { id: "delivered", shape: "decision", label: ["WhatsApp delivered?"], col: 1, row: 5 },
    { id: "email", shape: "message", label: ["The same message", "by email"], col: 1, row: 6 },
    { id: "done", shape: "exit", label: ["Delivered"], col: 2, row: 6 },
  ],
  edges: [
    { from: "due", to: "safety" },
    { from: "safety", to: "waits", label: ["Yes"], route: "across" },
    { from: "safety", to: "who", label: ["No"] },
    { from: "who", to: "consent", label: ["Recruit"] },
    { from: "who", to: "member", label: ["On the roster"] },
    { from: "consent", to: "nothing", label: ["Not granted"] },
    { from: "consent", to: "recruit", label: ["Granted"] },
    { from: "member", to: "escalation", label: ["Nobody answers"] },
    { from: "recruit", to: "delivered" },
    { from: "escalation", to: "delivered" },
    { from: "delivered", to: "done", label: ["Yes"] },
    { from: "delivered", to: "email", label: ["No — it", "failed"] },
  ],
};

export const ROSTER_DIAGRAM: FlowDiagram = {
  title: "How a season's roster is built and kept",
  nodes: [
    { id: "intake", shape: "operator", label: ["Add player"], col: 0, row: 0 },
    { id: "flip", shape: "automatic", label: ["A recruit joins"], col: 1, row: 0 },
    { id: "import", shape: "operator", label: ["Bulk import players"], col: 2, row: 0 },
    { id: "onboarding", shape: "state", label: ["Onboarding"], col: 1, row: 1 },
    {
      id: "board",
      shape: "operator",
      label: ["Fill the eight groups", "on the board"],
      col: 1,
      row: 2,
    },
    {
      id: "derived",
      shape: "automatic",
      label: ["Kit Distributed is", "derived from five items"],
      col: 2,
      row: 2,
    },
    { id: "active", shape: "state", label: ["Active"], col: 1, row: 3 },
    { id: "inactive", shape: "state", label: ["Inactive"], col: 0, row: 4 },
    { id: "departed", shape: "state", label: ["Departed"], col: 2, row: 4 },
    { id: "archived", shape: "exit", label: ["Archived"], col: 2, row: 5 },
  ],
  edges: [
    { from: "intake", to: "onboarding" },
    { from: "flip", to: "onboarding", label: ["Automatic"] },
    { from: "import", to: "onboarding" },
    { from: "onboarding", to: "board" },
    { from: "board", to: "derived", label: ["Automatic"], route: "across" },
    { from: "board", to: "active", label: ["Operator sets", "Active"] },
    { from: "active", to: "inactive" },
    { from: "inactive", to: "active", label: ["Either way,", "any time"], route: "around-left" },
    { from: "active", to: "departed" },
    { from: "departed", to: "archived" },
  ],
};

export const PEOPLE_DIAGRAM: FlowDiagram = {
  title: "How a person's record is corrected, merged, exported and erased",
  nodes: [
    { id: "record", shape: "state", label: ["Person record"], col: 1, row: 0 },
    { id: "missing", shape: "decision", label: ["Anything required", "missing?"], col: 1, row: 1 },
    {
      id: "queue",
      shape: "operator",
      label: ["Correct it, or nudge", "them for it"],
      col: 0,
      row: 1,
    },
    { id: "duplicate", shape: "decision", label: ["Two records,", "one person?"], col: 1, row: 2 },
    {
      id: "merge",
      shape: "operator",
      label: ["Merge, answering every", "difference"],
      col: 0,
      row: 2,
    },
    { id: "asked", shape: "decision", label: ["Have they asked?"], col: 1, row: 3 },
    { id: "export", shape: "operator", label: ["Export everything held"], col: 2, row: 3 },
    { id: "first", shape: "operator", label: ["First confirmation"], col: 1, row: 4 },
    {
      id: "second",
      shape: "operator",
      label: ["Second confirmation,", "another person"],
      col: 1,
      row: 5,
    },
    { id: "erased", shape: "exit", label: ["A record with no", "name on it"], col: 1, row: 6 },
  ],
  edges: [
    { from: "record", to: "missing" },
    { from: "missing", to: "queue", label: ["Yes"], route: "across" },
    { from: "missing", to: "duplicate", label: ["No"] },
    { from: "duplicate", to: "merge", label: ["Yes"], route: "across" },
    { from: "duplicate", to: "asked", label: ["No"] },
    { from: "asked", to: "export", label: ["For a copy"], route: "across" },
    { from: "asked", to: "first", label: ["To be removed"] },
    { from: "first", to: "second" },
    { from: "second", to: "erased", label: ["Both recorded"] },
  ],
};

export const OPERATORS_DIAGRAM: FlowDiagram = {
  title: "How an operator is invited, seated and stood down",
  nodes: [
    {
      id: "invite",
      shape: "operator",
      label: ["Invite operator:", "person, role, send"],
      col: 1,
      row: 0,
    },
    { id: "email", shape: "message", label: ["Invitation email"], col: 1, row: 1 },
    { id: "delivered", shape: "decision", label: ["Delivered?"], col: 1, row: 2 },
    { id: "failed", shape: "state", label: ["Delivery failed"], col: 0, row: 2 },
    { id: "pending", shape: "state", label: ["Invitation pending"], col: 1, row: 3 },
    { id: "password", shape: "decision", label: ["Password set?"], col: 1, row: 4 },
    { id: "active", shape: "state", label: ["Active"], col: 1, row: 5 },
    { id: "deactivated", shape: "state", label: ["Deactivated"], col: 2, row: 5 },
    {
      id: "role",
      shape: "operator",
      label: ["Assign, replace", "or end a role"],
      col: 1,
      row: 6,
    },
    { id: "vacant", shape: "exit", label: ["Not assigned"], col: 1, row: 7 },
  ],
  edges: [
    { from: "invite", to: "email" },
    { from: "email", to: "delivered" },
    { from: "delivered", to: "failed", label: ["No"], route: "across" },
    {
      from: "failed",
      to: "email",
      label: ["Resend, or correct", "the address"],
      route: "around-left",
    },
    { from: "delivered", to: "pending", label: ["Yes"] },
    { from: "pending", to: "password", label: ["They follow", "the link"] },
    { from: "password", to: "active", label: ["Yes"] },
    { from: "active", to: "deactivated", label: ["Deactivate", "access"], route: "across" },
    { from: "deactivated", to: "active", label: ["Restore access"], route: "across-return" },
    { from: "active", to: "role" },
    { from: "role", to: "vacant", label: ["End role"] },
  ],
};

export const REPORTS_DIAGRAM: FlowDiagram = {
  title: "How the week is read, and what is done about it",
  nodes: [
    {
      id: "week",
      shape: "automatic",
      label: ["A week of events, answers", "and attendance"],
      col: 1,
      row: 0,
    },
    { id: "open", shape: "operator", label: ["Open Report, press", "Show report"], col: 1, row: 1 },
    { id: "filed", shape: "automatic", label: ["A snapshot is filed"], col: 1, row: 2 },
    { id: "report", shape: "state", label: ["Monday report"], col: 1, row: 3 },
    { id: "missing", shape: "state", label: ["Missing data"], col: 0, row: 4 },
    { id: "followups", shape: "state", label: ["Follow-ups"], col: 2, row: 4 },
    { id: "nudge", shape: "operator", label: ["Nudge them"], col: 0, row: 5 },
    { id: "chase", shape: "operator", label: ["Chase them"], col: 2, row: 5 },
    {
      id: "escalation",
      shape: "message",
      label: ["Escalation to", "the President"],
      col: 2,
      row: 6,
    },
  ],
  edges: [
    { from: "week", to: "open" },
    { from: "open", to: "filed" },
    { from: "filed", to: "report" },
    { from: "report", to: "missing", label: ["Still outstanding"] },
    { from: "report", to: "followups", label: ["Nobody answered"] },
    { from: "missing", to: "nudge" },
    { from: "followups", to: "chase" },
    { from: "chase", to: "escalation", label: ["Automatic, at the", "deadline"] },
  ],
};
