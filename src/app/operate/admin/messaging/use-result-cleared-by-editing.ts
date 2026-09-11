/**
 * Shared by every row form in `schedule-form.tsx` and `schedule-row.tsx`
 * (LAN-300) — split out on its own so neither imports the other.
 */
import { useState } from "react";
import type { AdminActionState } from "../action-state";

/**
 * A saved result describes the values that produced it, so editing one of
 * them makes it stale. The trigger is the edit, not the submit — a browser
 * constraint (`min`/`max`) can block a submit outright, leaving no new
 * result to replace the stale one, so a `change` on any field marks the
 * current result stale directly rather than waiting for the next submit.
 * Nothing here suppresses a real refusal; it only stops one outliving the
 * values it was about.
 *
 * Decision history: docs/ux/tickets/LAN-171-plan-and-schedule.md.
 */
export function useResultClearedByEditing(state: AdminActionState): {
  showing: boolean;
  onChange: () => void;
} {
  const [staleFor, setStaleFor] = useState<AdminActionState | null>(null);
  return { showing: staleFor !== state, onChange: () => setStaleFor(state) };
}
