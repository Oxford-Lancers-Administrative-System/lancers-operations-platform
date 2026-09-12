"use client";

import { useState, useTransition } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { Notice } from "@/components/notice";
import { chaseSelectedAction, type ChaseActionResult } from "./actions";
import FollowUpsCards from "./follow-ups-cards";
import FollowUpsTable from "./follow-ups-table";
import type { FollowUpsFilters, QueueRow } from "./queue-filters";
import type { QueueSelection } from "./row-links";
import {
  andMore,
  chaseButtonLabel,
  chaseProblemNotice,
  chaseRefusalLine,
  chaseSentNotice,
  REFUSALS_NAMED,
} from "./presentation";

/**
 * The queue's board — LAN-329 and LAN-322, on `/operate/people/missing`'s own
 * `queue-board.tsx` shape rather than a second one.
 *
 * A client component for the one reason that queue's is: which rows are
 * ticked, and the "Chase N people" bar that appears once something is, are
 * interactive state no server render can hold. Everything a row says is still
 * server-computed and handed in as plain data; this draws it, holds the
 * selection, and calls the one action.
 */
export default function FollowUpsBoard({
  filters,
  rows,
  mayChase,
  mayOpenPerson,
}: {
  filters: FollowUpsFilters;
  rows: readonly QueueRow[];
  mayChase: boolean;
  mayOpenPerson: boolean;
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ChaseActionResult | null>(null);

  const chaseableIds = rows.filter((row) => row.chaseable).map((row) => row.invitationId);
  const selectedIds = chaseableIds.filter((id) => selected.has(id));

  function toggle(invitationId: string) {
    setResult(null);
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(invitationId)) next.delete(invitationId);
      else next.add(invitationId);
      return next;
    });
  }

  function toggleAll() {
    setResult(null);
    setSelected((previous) =>
      previous.size === chaseableIds.length ? new Set() : new Set(chaseableIds),
    );
  }

  function chase(invitationIds: readonly string[]) {
    setResult(null);
    startTransition(() => {
      void (async () => {
        const outcome = await chaseSelectedAction(invitationIds);
        setResult(outcome);
        if (outcome.accepted > 0) setSelected(new Set());
      })();
    });
  }

  const selection: QueueSelection = {
    selected,
    pending,
    mayChase,
    mayOpenPerson,
    toggle,
    toggleAll,
    chase,
  };

  const nameOf = (invitationId: string) =>
    rows.find((row) => row.invitationId === invitationId)?.personName ?? null;

  const namesFrom = (names: readonly string[]) => {
    const shown = names.slice(0, REFUSALS_NAMED);
    return names.length > shown.length
      ? `${shown.join(", ")} ${andMore(names.length - shown.length)}`
      : shown.join(", ");
  };

  const namesFor = (ids: readonly string[]) =>
    namesFrom(ids.map(nameOf).filter((name) => name !== null));

  /**
   * The refused, grouped by the reason they share.
   *
   * One line per person was the first shape, and pressing Chase on three
   * people locally produced the same four-sentence configuration paragraph
   * three times — the wall of text `REFUSALS_NAMED` exists to prevent,
   * rebuilt out of sentences instead of names. Refusals in one press are
   * nearly always the same refusal, so the reason is said once and everybody
   * it applies to is named against it. Each group's names are still capped and
   * the rest counted, for that constant's own recorded reason.
   *
   * First-appearance order, which is the queue's own order, so the first name
   * an operator reads is the first row they would have looked at.
   */
  const refusalGroups: { reason: string; names: string[] }[] = [];
  for (const refusal of result?.refusals ?? []) {
    const name = nameOf(refusal.invitationId);
    if (name === null) continue;
    const existing = refusalGroups.find((group) => group.reason === refusal.reason);
    if (existing) existing.names.push(name);
    else refusalGroups.push({ reason: refusal.reason, names: [name] });
  }

  return (
    <Stack spacing={2}>
      {mayChase && selectedIds.length > 0 ? (
        /*
         * Sticky, at both widths — LAN-322's walk. The bar appears at the top
         * of the board, and ticking a card scrolls the page to that card, so
         * on a queue of any length the operator's own selection carried the
         * one control that acts on it off the screen (measured at 375px:
         * y = -386 after ticking a card partway down). Selecting several
         * people and then being unable to find the button is the whole
         * feature failing quietly.
         *
         * `top` clears the phone shell's own fixed 56px top bar and sits at
         * the top of the column on desktop, where the sidebar is the only
         * other sticky thing. `zIndex` is below MUI's `appBar` (1100) so the
         * phone bar and its drawer still pass over this, and below
         * `ActionBar`'s 1099 for the same reason it chose that number. The
         * background is opaque because rows scroll underneath it.
         */
        <Stack
          direction="row"
          spacing={2}
          sx={{
            alignItems: "center",
            position: "sticky",
            top: { xs: 56, md: 0 },
            zIndex: 1098,
            // Opaque, and the full width of the board itself, because the
            // queue scrolls underneath it.
            bgcolor: "background.default",
            py: 1.5,
            borderBottom: 1,
            borderColor: "divider",
          }}
          data-testid="chase-bar"
        >
          <Button
            variant="contained"
            disabled={pending}
            onClick={() => chase(selectedIds)}
            sx={{ minHeight: 44 }}
            data-testid="chase-selected"
          >
            {chaseButtonLabel(selectedIds.length)}
          </Button>
        </Stack>
      ) : null}

      {result?.error ? (
        <Notice severity="warning" testId="chase-error">
          {result.error}
        </Notice>
      ) : null}
      {result && result.accepted > 0 ? (
        <Notice severity="success" testId="chase-notice">
          {chaseSentNotice(result.accepted)}
        </Notice>
      ) : null}
      {result && result.refusals.length > 0 ? (
        <Notice severity="warning" testId="chase-refused">
          {chaseProblemNotice(result.refusals.length)}
          <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
            {refusalGroups.map((group) => (
              <li key={group.reason}>{chaseRefusalLine(namesFrom(group.names), group.reason)}</li>
            ))}
          </Box>
        </Notice>
      ) : null}
      {result && result.notOutstandingInvitationIds.length > 0 ? (
        <Notice severity="warning" testId="chase-answered">
          {`Already answered or stood down: ${namesFor(result.notOutstandingInvitationIds)}`}
        </Notice>
      ) : null}

      <FollowUpsTable filters={filters} rows={rows} selection={selection} />
      <FollowUpsCards rows={rows} selection={selection} />
    </Stack>
  );
}
