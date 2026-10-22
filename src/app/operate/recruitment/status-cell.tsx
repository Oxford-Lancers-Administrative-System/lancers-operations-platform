"use client";

import { useState, useTransition } from "react";
import { Notice } from "@/components/notice";
import { useOutcomeSlot } from "@/components/outcome-slot";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
import { Field } from "@/components/field";
import Typography from "@mui/material/Typography";
import { PROSPECT_STATUS_LABELS, type ProspectStatus } from "@/lib/services/recruitment-vocabulary";
import { StatusPill } from "../board-filter-controls";
import type { StatusControl } from "@/lib/services/recruitment-board-access";
import { flipRecruitmentProspectAction, setRecruitmentStatusAction } from "./board-actions";

/** LAN-505 (Brian, 16 October 2026): the line the control shows in Joined's place. */
export const JOINED_NEEDS_PERMISSION =
  "Moving to Joined needs the May move recruits to Joined permission.";

/** LAN-505: the caption beside a status this seat cannot change. */
export const STATUS_READ_ONLY = "Read only";

/** The statuses a control offers, in board order. */
function offeredStatuses(control: StatusControl, current: ProspectStatus): ProspectStatus[] {
  switch (control) {
    case "full":
      return [...STATUS_ORDER];
    case "without_joined":
      return STATUS_ORDER.filter((value) => value !== "joined");
    case "joined_only":
      return STATUS_ORDER.filter((value) => value === current || value === "joined");
    case "read_only":
      return [current];
  }
}

const STATUS_ORDER: readonly ProspectStatus[] = [
  "identified",
  "engaged",
  "committed",
  "joined",
  "declined",
  "disengaged",
  "void",
];

/**
 * The one status control every recruit surface shares — `W1`'s board cell and
 * `W2`'s record both edit the same field the same way. A pill by default —
 * the same click-to-edit interaction the roster board's own status cell uses
 * (item 1: "Today the board renders a bare MUI dropdown in the cell — that is
 * the reinvention"). Clicking it opens the identical `Select` every other
 * board and record edit uses, autofocused, offering every value with no
 * transition ever refused by the control (`Q-every-status-reachable`).
 *
 * Every value except `joined` is a direct, audited, uninterrupted change
 * (`W13`: "no confirmation screen and no callout"), with one exception —
 * `void` asks for the reason the schema requires, in a small dialog rather
 * than losing the change to a raw constraint error. `joined` is `W14`'s own
 * interruption: what it will create, what it will not do, and nothing
 * written on cancel.
 */
export default function StatusCell({
  prospectId,
  status,
  displayName,
  seasonLabel,
  size = "small",
  testIdPrefix = "recruitment-status",
  control = "full",
}: {
  prospectId: string;
  status: ProspectStatus;
  displayName: string;
  seasonLabel: string;
  size?: "small" | "medium";
  /**
   * LAN-505 — what this seat may change the status to (`statusControlFor`):
   * every status, every status but Joined (saying why), the current status
   * and Joined, or nothing (saying so).
   */
  control?: StatusControl;
  /**
   * LAN-319. The board draws this control twice — once in the desktop table's
   * cell and once on the phone card — and only one of them is on screen at a
   * time. They are separate elements all the same, so each names itself and
   * claims the outcome slot separately rather than two live controls sharing
   * one test id and one error.
   */
  testIdPrefix?: string;
}) {
  const slot = useOutcomeSlot(`${testIdPrefix}-${prospectId}`);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [flipOpen, setFlipOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  function commitStatus(toStatus: Exclude<ProspectStatus, "joined">, reason?: string) {
    slot.claim();
    startTransition(async () => {
      const result = await setRecruitmentStatusAction({ prospectId, toStatus, reason });
      setError(result.error);
    });
  }

  function handleChange(event: SelectChangeEvent<string>) {
    const next = event.target.value as ProspectStatus;
    setEditing(false);
    if (next === status) return;
    slot.claim();
    if (next === "joined") {
      setFlipOpen(true);
      return;
    }
    if (next === "void") {
      setVoidReason("");
      setVoidOpen(true);
      return;
    }
    commitStatus(next);
  }

  function confirmFlip() {
    startTransition(async () => {
      const result = await flipRecruitmentProspectAction({ prospectId });
      setError(result.error);
      setFlipOpen(false);
    });
  }

  const offered = offeredStatuses(control, status);
  // Nothing to change to: neither grant, or the switch alone on a recruit
  // already Joined.
  if (control === "read_only" || offered.length < 2) {
    return (
      <Box
        data-testid={`${testIdPrefix}-cell-${prospectId}`}
        sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}
      >
        <StatusPill domain="recruitment" status={status} label={PROSPECT_STATUS_LABELS[status]} />
        <Typography
          variant="caption"
          color="text.secondary"
          data-testid={`${testIdPrefix}-read-only-${prospectId}`}
        >
          {STATUS_READ_ONLY}
        </Typography>
      </Box>
    );
  }

  return (
    <Box data-testid={`${testIdPrefix}-cell-${prospectId}`}>
      {editing ? (
        <Select
          value={status}
          open
          autoFocus
          onChange={handleChange}
          onClose={() => setEditing(false)}
          size={size}
          disabled={pending}
          fullWidth
          sx={{ minHeight: 36 }}
          data-testid={`${testIdPrefix}-select-${prospectId}`}
        >
          {offered.map((value) => (
            <MenuItem key={value} value={value}>
              {PROSPECT_STATUS_LABELS[value]}
            </MenuItem>
          ))}
          {control === "without_joined" ? (
            <MenuItem
              disabled
              value=""
              sx={{ whiteSpace: "normal", maxWidth: 320 }}
              data-testid={`${testIdPrefix}-joined-needs-permission-${prospectId}`}
            >
              <Typography variant="caption">{JOINED_NEEDS_PERMISSION}</Typography>
            </MenuItem>
          ) : null}
        </Select>
      ) : (
        <Box
          onClick={() => (pending ? undefined : setEditing(true))}
          data-testid={`${testIdPrefix}-select-${prospectId}`}
          sx={{
            display: "inline-block",
            cursor: pending ? "default" : "pointer",
            borderRadius: 0.5,
            "&:hover": pending
              ? undefined
              : { outline: "1px solid", outlineColor: "primary.light" },
          }}
        >
          <StatusPill domain="recruitment" status={status} label={PROSPECT_STATUS_LABELS[status]} />
        </Box>
      )}
      {slot.showing && error && !flipOpen ? <Notice severity="error">{error}</Notice> : null}

      <Dialog open={voidOpen} onClose={() => (pending ? undefined : setVoidOpen(false))}>
        <DialogTitle>Void this record</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            The record was a mistake and should never have existed. Say why.
          </DialogContentText>
          <Field
            autoFocus
            multiline
            minRows={2}
            label="Reason"
            value={voidReason}
            onChange={(event) => setVoidReason(event.target.value)}
            data-testid="recruitment-void-reason"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVoidOpen(false)} disabled={pending} sx={{ minHeight: 44 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={pending || voidReason.trim() === ""}
            onClick={() => {
              commitStatus("void", voidReason);
              setVoidOpen(false);
            }}
            sx={{ minHeight: 44 }}
            data-testid="recruitment-void-confirm"
          >
            Void
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={flipOpen} onClose={() => (pending ? undefined : setFlipOpen(false))}>
        <DialogTitle>Join {displayName}?</DialogTitle>
        <DialogContent>
          <DialogContentText component="div">
            <Typography variant="body2" sx={{ mb: 1.5 }}>
              This will:
            </Typography>
            <Box component="ul" sx={{ mt: 0, mb: 1.5, pl: 3 }}>
              <li>Create a season membership for {seasonLabel}</li>
              <li>Add them to the roster</li>
              <li>Open onboarding</li>
            </Box>
            <Typography variant="body2">It will not make them active.</Typography>
          </DialogContentText>
          {slot.showing && error ? <Notice severity="error">{error}</Notice> : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFlipOpen(false)} disabled={pending} sx={{ minHeight: 44 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={pending}
            onClick={confirmFlip}
            sx={{ minHeight: 44 }}
            data-testid="recruitment-flip-confirm"
          >
            Confirm join
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
