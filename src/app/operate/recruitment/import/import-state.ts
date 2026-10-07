import type {
  RecruitDuplicateAnswers,
  RecruitImportApplied,
  RecruitImportPlan,
} from "@/lib/services/recruit-csv";

// The recruit import's screen state — LAN-487, `../../roster/import/import-state.ts`'s shape.
export interface RecruitImportScreenState {
  error: string | null;
  plan: RecruitImportPlan | null;
  csvText: string | null;
  fileName: string | null;
  duplicateAnswers: RecruitDuplicateAnswers;
  applied: RecruitImportApplied | null;
}

export const EMPTY_RECRUIT_IMPORT_STATE: RecruitImportScreenState = {
  error: null,
  plan: null,
  csvText: null,
  fileName: null,
  duplicateAnswers: {},
  applied: null,
};

export const NO_FILE_CHOSEN_MESSAGE = "Choose a CSV file to import.";
