/**
 * Every word `/operate/events/[id]/roster-form` says — LAN-267.
 *
 * Labels, values and states only. The explanation of what a BAFRA roster form
 * is belongs outside the application frame, not on the screen.
 */

export const HEADING = "Roster form";
export const BACK_LABEL = "Back to the game";
export const GENERIC_UNAVAILABLE =
  "The roster form could not be read just now. Try again in a minute.";

export const FILTERS_TITLE = "Who is dressing";
export const KIT_LABEL = "Kit";
export const KIT_OPTIONS = [
  { value: "blue", label: "Blue" },
  { value: "white", label: "White" },
] as const;

export const RSVP_LABEL = "RSVP";
export const RSVP_OPTIONS = [
  { value: "all", label: "Everyone" },
  { value: "yes", label: "Said yes" },
  { value: "no", label: "Said no" },
  { value: "unanswered", label: "Unanswered" },
] as const;

export const OPPONENT_LABEL = "Opponent";
export const OPPONENT_HELPER = "Printed on the form. Starts from the game's name.";

export const SELECT_ALL = "Tick all";
export const SELECT_NONE = "Untick all";
export const GENERATE = "Generate";
export const PRINT = "Print";
export const BACK_TO_PICKING = "Change who is dressing";

export const COLUMN_DRESSED = "Dressed";
export const COLUMN_NAME = "Name";
export const COLUMN_JERSEY = "Jersey";
export const COLUMN_STUDENT_NUMBER = "Student no";
export const COLUMN_RSVP = "RSVP";
export const COLUMN_BAFA = "BAFA no";
export const COLUMN_ROLE = "Role";

export const RSVP_YES = "Yes";
export const RSVP_NO = "No";
export const RSVP_UNANSWERED = "Unanswered";

export const NO_JERSEY = "No number";
export const EMPTY_ROSTER = "No player on this season's roster matches these filters.";
export const NO_COACHES = "No coaching seat is filled for this season.";

export const TEAM_LABEL = "Team";
export const DATE_LABEL = "Date";
export const PLAYERS_TITLE = "Players";
export const COACHES_TITLE = "Coaches / sideline personnel";

export const DRESSED_COUNT = (count: number): string =>
  `${count} player${count === 1 ? "" : "s"} dressed`;

// ---------------------------------------------------------------------------
// The warning line above the form — LAN-267
// ---------------------------------------------------------------------------

export const MISSING_STUDENT_NUMBERS = (names: readonly string[]): string =>
  `No student number on file: ${names.join("; ")}.`;

export const MISSING_BAFA_NUMBERS = (names: readonly string[]): string =>
  `No BAFA number on file: ${names.join("; ")}.`;

export const NOT_ON_THE_FORM = (names: readonly string[]): string =>
  `Ticked but with no number in this kit, so not on the form: ${names.join("; ")}.`;

export const GENERATED_NOTE = "Recorded. Print this page, or save it as a PDF.";
