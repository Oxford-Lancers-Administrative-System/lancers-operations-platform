import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { NotRecorded } from "@/components/fact";
import { RecordRow as Row } from "@/components/record-field";
import { StatusChip } from "@/components/status-chip";
import type { OnboardingItemStatus } from "@/lib/services/membership";
import {
  allowedItemStates,
  isDerivedItem,
  itemStateLabel,
} from "@/lib/services/onboarding-item-shapes";
import type {
  OnboardingItemDisplay,
  OnboardingItemHistoryEntry,
} from "@/lib/services/player-record";
import { formatDay } from "../presentation";

function shortDay(occurredAt: Date): string {
  return formatDay(occurredAt.toISOString().slice(0, 10));
}

/** The row's provenance slot — who and when, per state, never narrative text (W6's acceptance correction). */
function provenanceNote(item: OnboardingItemDisplay): string | undefined {
  const history = item.history;
  if (history.length === 0) return undefined;

  const latest = history[history.length - 1];
  const who =
    latest.actorName ??
    (latest.actorKind === "player"
      ? "the player"
      : latest.actorKind === "system"
        ? "the system"
        : "an operator");
  const when = shortDay(latest.occurredAt);

  let head: string;
  // The one transition already folded into `head` — set only by `complete`, naming the player's own claim.
  let folded: OnboardingItemHistoryEntry | null = null;
  switch (latest.toStatus) {
    case "waived":
      head = latest.reason
        ? `Waived by ${who}, ${when} — ${latest.reason}`
        : `Waived by ${who}, ${when}`;
      break;
    // D-002 (round 6): no "Reopen" verb — a transition back to `pending` is named like any other.
    case "pending":
      head = `Set to ${itemStateLabel(item.code, "pending")} by ${who}, ${when}`;
      break;
    case "claimed":
      head = `${who}, ${when} · awaiting confirmation`;
      break;
    case "complete": {
      // `R2-V`: a trust-class item completes on the player's own word — note names who claimed it and when.
      const claim = [...history]
        .reverse()
        .find((entry) => entry.toStatus === "claimed" && entry.actorKind === "player");
      if (claim) {
        const claimant = claim.actorName ?? "the player";
        head = `${claimant}, ${shortDay(claim.occurredAt)} · player-claimed`;
        folded = claim;
      } else {
        head = `${who}, ${when}`;
      }
      break;
    }
    default:
      head = `${who}, ${when}`;
  }

  if (history.length === 1) return head;

  const previous = history[history.length - 2];
  if (previous === folded) return head;

  const previousWord = itemStateLabel(item.code, previous.toStatus);
  const earlierCount = history.length - 2;
  const earlierSuffix =
    earlierCount > 0 ? ` · ${earlierCount} earlier change${earlierCount === 1 ? "" : "s"}` : "";
  return `${head} · ${previousWord} ${shortDay(previous.occurredAt)}${earlierSuffix}`;
}

/** One onboarding item — provenance shown, edited in-place like every other season value, no Resolve/SAVE pair. */
export default function OnboardingRow({
  item,
  editing,
  readOnly,
  blank = false,
  error,
  onOpen,
  onClose,
  onResolve,
}: {
  item: OnboardingItemDisplay;
  editing: boolean;
  readOnly: boolean;
  /** D-002 (Q-14): "Subscription paid" is blank until "Subscription invoiced" is itself complete. */
  blank?: boolean;
  error: string | null;
  onOpen: () => void;
  onClose: () => void;
  onResolve: (status: OnboardingItemStatus) => void;
}) {
  const derived = isDerivedItem(item.code);
  const editable = !readOnly && !blank && !derived;
  const states = allowedItemStates(item.code);
  const closedLabel = itemStateLabel(item.code, item.status);

  return (
    <Row label={item.label} note={provenanceNote(item)}>
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: "center", flexWrap: "wrap", gap: 0.5, mb: 0.5 }}
      >
        {item.isRequired ? (
          <StatusChip domain="onboardingItem" status="required" label="Required" />
        ) : null}
        {item.isSubscription ? (
          <StatusChip
            domain="onboardingItem"
            status="never_blocks"
            label="Never blocks activation"
          />
        ) : null}
      </Stack>
      {editing ? (
        <Select
          size="small"
          open
          autoFocus
          value=""
          displayEmpty
          onClose={onClose}
          onChange={(event) => onResolve(event.target.value as OnboardingItemStatus)}
          renderValue={() => closedLabel}
          sx={{ minWidth: 220 }}
        >
          {states.map((status) => (
            <MenuItem key={status} value={status}>
              {itemStateLabel(item.code, status)}
            </MenuItem>
          ))}
        </Select>
      ) : (
        <Box
          onClick={editable ? onOpen : undefined}
          data-testid={editable ? "editable-field" : undefined}
          sx={{
            display: "inline-block",
            cursor: editable ? "pointer" : "default",
            borderRadius: 0.5,
            px: editable ? 0.5 : 0,
            mx: editable ? -0.5 : 0,
            "&:hover": editable ? { bgcolor: "action.hover" } : undefined,
          }}
        >
          {blank ? (
            <NotRecorded />
          ) : (
            <Typography
              variant="body2"
              sx={{
                textDecoration: editable ? "underline" : "none",
                textUnderlineOffset: 3,
                textDecorationColor: "rgba(0,0,0,0.25)",
              }}
            >
              {closedLabel}
            </Typography>
          )}
        </Box>
      )}
      {error ? (
        <Typography variant="caption" color="error" sx={{ display: "block", mt: 0.25 }}>
          {error}
        </Typography>
      ) : null}
    </Row>
  );
}
