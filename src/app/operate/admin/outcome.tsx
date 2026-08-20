"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import type { AdminActionState } from "./action-state";

/**
 * How an Administration action reports what happened — LAN-133, LAN133-BRIAN-1
 * and LAN133-BRIAN-3.
 *
 * Two rules live here, and both were found by Brian rather than reasoned out in
 * advance.
 *
 * ## 1. Three outcomes, three treatments, in one place
 *
 * An action ends in one of three ways, and they are not interchangeable:
 *
 *   * a **refusal** — the club's rules do not permit this administrator to do
 *     this to this person. It is not a failure and retrying cannot change it,
 *     so it is neither red nor dismissible-looking, and it keeps the guard's own
 *     sentence verbatim;
 *   * an **error** — something the operator can act on: a malformed address, a
 *     missing reason, a delivery that did not go through;
 *   * a **notice** — it worked.
 *
 * Three screens used to render those inline, in three slightly different ways,
 * and none of them rendered a refusal at all because refusals were thrown
 * instead of returned. One component means a refusal cannot be styled as a
 * validation error on one screen and as a crash on another.
 *
 * ## 2. Starting an action clears the previous action's result
 *
 * `DEC-single-actor` makes these actions immediate and single-actor, which means
 * the screen's confirmations are the only record of what just happened — and two
 * of them on screen at once is therefore not untidy, it is wrong. Brian raised
 * it twice: "The invitation has been sent again" sat under Resend while "The
 * invitation has been sent again, to jrabbit@gmail.com" sat under Correct and
 * resend, and both read as though they had just happened. One of them was
 * minutes old.
 *
 * The general rule this proposes is the narrowest one that cannot produce that:
 *
 * > **A screen shows the result of at most one action. Starting another action
 * > clears the previous one's result.**
 *
 * Not "results expire", which invents a duration nobody chose; not "only the
 * newest is green", which still shows two. The mechanism is a slot: panels
 * register through {@link useOutcomeSlot}, claiming it when their form is
 * submitted, and {@link AdminOutcome} draws nothing for a panel that no longer
 * holds it. A screen with a single action needs no provider and behaves
 * identically, because a lone panel always holds the slot.
 *
 * It is deliberately a *display* rule. Nothing here cancels a request, and an
 * action whose result is cleared still happened — the audit history is what
 * records that, and it is on the same page.
 */

/** The panel currently entitled to show its result, and how to claim it. */
const OutcomeSlot = createContext<{
  holder: string | null;
  claim: (panel: string) => void;
} | null>(null);

/**
 * Wraps the panels on one screen so that only the most recently started action
 * shows its outcome. Screens with one action may omit it.
 */
export function OutcomeSlotProvider({ children }: { children: ReactNode }) {
  const [holder, setHolder] = useState<string | null>(null);
  const value = useMemo(() => ({ holder, claim: setHolder }), [holder]);
  return <OutcomeSlot.Provider value={value}>{children}</OutcomeSlot.Provider>;
}

/**
 * One panel's view of the slot.
 *
 * `claim` belongs on the form's `onSubmit`, which fires before the action runs,
 * so the previous panel's confirmation disappears the moment a new action
 * starts rather than when it finishes. `showing` is false while another panel
 * holds the slot.
 *
 * Outside a provider both degrade to "always mine", so a single-action screen
 * needs no ceremony and no provider.
 */
export function useOutcomeSlot(panel: string): { showing: boolean; claim: () => void } {
  const slot = useContext(OutcomeSlot);
  if (!slot) return { showing: true, claim: () => {} };
  return {
    showing: slot.holder === null || slot.holder === panel,
    claim: () => slot.claim(panel),
  };
}

/**
 * A notice this page arrived carrying, rather than one an action produced here.
 *
 * `inviteOperatorAction` redirects to operator detail with a `notice` query
 * parameter, and the banner it produces is server-rendered from `searchParams`.
 * That put it outside the slot and therefore outside the rule — which the
 * undelivered-invitation banner then broke on the very path it instructs. It
 * says to check the address, correct it and send it again;
 * `correctInvitationAction` refreshes without redirecting, so the query
 * parameter survives and its banner sat above the panel's fresh confirmation.
 * Two results, both reading as current: Brian's original complaint, reached by
 * following the page's own instruction.
 *
 * Reading the slot like any panel is what fixes it. The moment another action
 * on this page starts, the arrival notice stops being the current result and
 * stops being drawn. It never *claims* the slot, because arriving on a page is
 * not an action the operator took on it.
 */
export function ArrivalNotice({
  severity,
  message,
}: {
  severity: "success" | "warning";
  message: string;
}) {
  const slot = useOutcomeSlot("arrival");
  if (!slot.showing) return null;

  return (
    <Alert severity={severity} data-testid="arrival-notice">
      {message}
    </Alert>
  );
}

/**
 * The outcome of one action, or nothing.
 *
 * Refusal first: an action can only end one way, but a refusal is the one an
 * operator most needs to read and the one a careless ordering would bury.
 */
export default function AdminOutcome({
  state,
  showing = true,
}: {
  state: AdminActionState;
  /** False while another panel on this screen owns the outcome slot. */
  showing?: boolean;
}) {
  if (!showing) return null;

  if (state.refusal) {
    return (
      <Alert severity="warning" sx={{ mt: 2 }} data-testid="admin-refusal">
        <AlertTitle>Not permitted</AlertTitle>
        {state.refusal}
      </Alert>
    );
  }
  if (state.error) {
    return (
      <Alert severity="error" sx={{ mt: 2 }} data-testid="admin-error">
        {state.error}
      </Alert>
    );
  }
  if (state.notice) {
    return (
      <Alert severity="success" sx={{ mt: 2 }} data-testid="admin-notice">
        {state.notice}
      </Alert>
    );
  }
  return null;
}
