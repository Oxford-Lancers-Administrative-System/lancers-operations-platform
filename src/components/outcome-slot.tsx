"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Notice } from "./notice";

/**
 * One action's result at a time — `docs/ux/standards.md` rule 1, promoted out
 * of `src/app/operate/admin/outcome.tsx` for the whole application (LAN-225,
 * brief §2 `OutcomeSlot`).
 *
 * The rule: **a screen shows the result of at most one action; starting
 * another action clears the previous one's result.** Panels register through
 * {@link useOutcomeSlot}, claim the slot when their form is submitted, and
 * {@link Outcome} draws nothing for a panel that no longer holds it. A screen
 * with a single action needs no provider and behaves identically.
 *
 * It is a display rule. Nothing here cancels a request, and an action whose
 * result is cleared still happened — the audit history records that.
 */
export interface OutcomeState {
  readonly refusal: string | null;
  readonly error: string | null;
  readonly notice: string | null;
}

export const EMPTY_OUTCOME: OutcomeState = Object.freeze({
  refusal: null,
  error: null,
  notice: null,
});

const Slot = createContext<{ holder: string | null; claim: (panel: string) => void } | null>(null);

export function OutcomeSlotProvider({ children }: { children: ReactNode }) {
  const [holder, setHolder] = useState<string | null>(null);
  const value = useMemo(() => ({ holder, claim: setHolder }), [holder]);
  return <Slot.Provider value={value}>{children}</Slot.Provider>;
}

/** `claim` belongs on the form's `onSubmit`, so the previous result disappears the moment a new action starts. */
export function useOutcomeSlot(panel: string): { showing: boolean; claim: () => void } {
  const slot = useContext(Slot);
  if (!slot) return { showing: true, claim: () => {} };
  return { showing: slot.holder === null || slot.holder === panel, claim: () => slot.claim(panel) };
}

/** A notice the page arrived carrying (a redirect's `?notice=`). It reads the slot but never claims it. */
export function ArrivalNotice({
  severity,
  children,
  testId = "arrival-notice",
}: {
  severity: "success" | "warning";
  children: ReactNode;
  testId?: string;
}) {
  const slot = useOutcomeSlot("arrival");
  if (!slot.showing) return null;
  return (
    <Notice severity={severity} testId={testId}>
      {children}
    </Notice>
  );
}

/** The outcome of one action, or nothing. Refusal first: it is the one the operator most needs to read. */
export function Outcome({ state, showing = true }: { state: OutcomeState; showing?: boolean }) {
  if (!showing) return null;
  if (state.refusal) {
    return (
      <Notice variant="refusal" testId="outcome-refusal">
        {state.refusal}
      </Notice>
    );
  }
  if (state.error) {
    return (
      <Notice severity="error" testId="outcome-error">
        {state.error}
      </Notice>
    );
  }
  if (state.notice) {
    return (
      <Notice severity="success" testId="outcome-notice">
        {state.notice}
      </Notice>
    );
  }
  return null;
}
