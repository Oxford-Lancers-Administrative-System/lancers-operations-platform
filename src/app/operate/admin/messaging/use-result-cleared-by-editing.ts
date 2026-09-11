import { useState } from "react";
import type { AdminActionState } from "../action-state";

export function useResultClearedByEditing(state: AdminActionState): {
  showing: boolean;
  onChange: () => void;
} {
  const [staleFor, setStaleFor] = useState<AdminActionState | null>(null);
  return { showing: staleFor !== state, onChange: () => setStaleFor(state) };
}
