import type {
  DuplicateAnswers,
  RosterImportApplied,
  RosterImportPlan,
} from "@/lib/services/roster-csv";

// Mirrors ../../events/import/import-state.ts, plus duplicateAnswers — LAN-215, `W1`.
export interface ImportScreenState {
  error: string | null;
  plan: RosterImportPlan | null;
  csvText: string | null;
  fileName: string | null;
  duplicateAnswers: DuplicateAnswers;
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

export const NO_FILE_CHOSEN_MESSAGE = "Choose a CSV file to import.";
