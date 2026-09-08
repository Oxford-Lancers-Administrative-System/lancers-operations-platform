import type {
  DuplicateAnswers,
  RosterImportApplied,
  RosterImportPlan,
} from "@/lib/services/roster-csv";

/**
 * What the roster's bulk import screen hands back and forth. LAN-215, `W1`.
 *
 * Mirrors `../../events/import/import-state.ts` line for line, plus one
 * field the event import has no need of: `duplicateAnswers`, the operator's
 * running "same person / different person" answers, carried through exactly
 * as the file's own text is — never stored, rebuilt into the proposal on
 * every submission.
 *
 * Types come from `@/lib/services/roster-csv`, which is pure, and never from
 * `@/lib/services/roster-import`, which is `server-only` — the client
 * component reads this module, and a type import that dragged the database
 * module into the browser bundle would not build.
 */
export interface ImportScreenState {
  /** One sentence about the whole file, or the whole apply. */
  error: string | null;
  /** The proposal the operator is being asked to confirm. */
  plan: RosterImportPlan | null;
  /** The file's text, carried through the confirmation. Never stored. */
  csvText: string | null;
  fileName: string | null;
  /** The operator's duplicate answers so far, carried through the confirmation. */
  duplicateAnswers: DuplicateAnswers;
  /** Set once, after an apply that committed. */
  applied: RosterImportApplied | null;
}

export const EMPTY_IMPORT_STATE: ImportScreenState = {
  error: null,
  plan: null,
  csvText: null,
  fileName: null,
  duplicateAnswers: {},
  applied: null,
};

/** What the operator is told when they chose no file at all. */
export const NO_FILE_CHOSEN_MESSAGE = "Choose a CSV file to import.";
