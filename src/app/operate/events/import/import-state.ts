import type { ImportApplied, ImportPlan } from "@/lib/services/event-csv";

// What the bulk import screen hands back and forth — LAN-155.
export interface ImportScreenState {
  error: string | null;
  plan: ImportPlan | null;
  csvText: string | null;
  fileName: string | null;
  applied: ImportApplied | null;
}

export const EMPTY_IMPORT_STATE: ImportScreenState = {
  error: null,
  plan: null,
  csvText: null,
  fileName: null,
  applied: null,
};

export const NO_FILE_CHOSEN_MESSAGE = "Choose a CSV file to import.";
