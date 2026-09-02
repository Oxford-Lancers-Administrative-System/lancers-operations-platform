"use client";

import { useState, useTransition } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { PROSPECT_STATUS_LABELS, type ProspectStatus } from "@/lib/services/recruitment-vocabulary";
import { StatusPill } from "../board-filter-controls";
import { flipRecruitmentProspectAction, setRecruitmentStatusAction } from "./board-actions";
import { STATUS_COLOUR_FOR_PILL } from "./status-colour";

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
}: {
  prospectId: string;
  status: ProspectStatus;
  displayName: string;
  seasonLabel: string;
  size?: "small" | "medium";
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [flipOpen, setFlipOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  function commitStatus(toStatus: Exclude<ProspectStatus, "joined">, reason?: string) {
    startTransition(async () => {
      const result = await setRecruitmentStatusAction({ prospectId, toStatus, reason });
      setError(result.error);
    });
  }

  function handleChange(event: SelectChangeEvent<string>) {
    const next = event.target.value as ProspectStatus;
    setEditing(false);
    if (next === status) return;
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

  return (
    <Box data-testid={`recruitment-status-cell-${prospectId}`}>
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
          data-testid={`recruitment-status-select-${prospectId}`}
        >
          {STATUS_ORDER.map((value) => (
            <MenuItem key={value} value={value}>
              {PROSPECT_STATUS_LABELS[value]}
            </MenuItem>
          ))}
        </Select>
      ) : (
        <Box
          onClick={() => (pending ? undefined : setEditing(true))}
          data-testid={`recruitment-status-select-${prospectId}`}
          sx={{
            display: "inline-block",
            cursor: pending ? "default" : "pointer",
            borderRadius: 0.5,
            "&:hover": pending
              ? undefined
              : { outline: "1px solid", outlineColor: "primary.light" },
          }}
        >
          <StatusPill
            color={STATUS_COLOUR_FOR_PILL[status]}
            label={PROSPECT_STATUS_LABELS[status]}
          />
        </Box>
      )}
      {error ? (
        <Typography variant="caption" color="error" component="p" sx={{ mt: 0.5 }}>
          {error}
        </Typography>
      ) : null}

      <Dialog open={voidOpen} onClose={() => (pending ? undefined : setVoidOpen(false))}>
        <DialogTitle>Void this record</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            The record was a mistake and should never have existed. Say why.
          </DialogContentText>
          <TextField
            autoFocus
            fullWidth
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
          {error ? (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          ) : null}
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
