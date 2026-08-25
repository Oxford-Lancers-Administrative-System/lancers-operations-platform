import type { ImportApplied, ImportPlan } from "@/lib/services/event-csv";

/**
 * What the bulk import screen hands back and forth. LAN-155.
 *
 * It lives beside `actions.ts` rather than in it for the reason
 * `../form-state.ts` gives: a `"use server"` module may export only async
 * functions, so a shared constant or a type exported from there would be a build
 * error.
 *
 * It imports from `@/lib/services/event-csv`, which is pure, and never from
 * `event-import.ts`, which is `server-only` — the client component reads this
 * module, and a type import that dragged the database module into the browser
 * bundle would not build.
 *
 * ## Why the file's own text is in here
 *
 * `REQ-import-confirmation`: an import is a proposal until accepted, and nothing
 * is written until the operator confirms. The proposal therefore has to survive
 * a round trip, and the two ways of doing that are storing it on the server or
 * carrying it in the form. `W3` says the uploaded file is "held only long enough
 * to produce the confirmation, and not retained as a record", which rules the
 * first one out: a staging table is a record, and an abandoned confirmation
 * would leave one behind.
 *
 * So the text goes back to the browser and returns with the confirmation, and
 * `applySeasonImport` rebuilds the plan from it inside the apply transaction and
 * refuses unless the digest still matches. Abandoning the confirmation leaves
 * nothing anywhere, because there was never anything to leave.
 */
export interface ImportScreenState {
  /** One sentence about the whole file, or the whole apply. */
  error: string | null;
  /** The proposal the operator is being asked to confirm. */
  plan: ImportPlan | null;
  /** The file's text, carried through the confirmation. Never stored. */
  csvText: string | null;
  fileName: string | null;
  /** Set once, after an apply that committed. */
  applied: ImportApplied | null;
}

export const EMPTY_IMPORT_STATE: ImportScreenState = {
  error: null,
  plan: null,
  csvText: null,
  fileName: null,
  applied: null,
};

/** The three things the one action can be asked to do. */
export const IMPORT_INTENTS = ["propose", "apply", "cancel"] as const;
export type ImportIntent = (typeof IMPORT_INTENTS)[number];

/** What the operator is told when they chose no file at all. */
export const NO_FILE_CHOSEN_MESSAGE = "Choose a CSV file to import.";
