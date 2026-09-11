export interface CancelFormState {
  error: string | null;
  reason: string;
}

export const EMPTY_CANCEL_STATE: CancelFormState = { error: null, reason: "" };
