import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { NotRecorded } from "@/components/fact";
import { FIELD_EDITOR_SX, FieldStatus, RecordRow as Row } from "@/components/record-field";
import { StatusChip } from "@/components/status-chip";
import type { OnboardingItemStatus } from "@/lib/services/membership";
import {
  allowedItemStates,
  isDerivedItem,
  isItemResolved,
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

/**
 * The agreement's own facts, for the two document items — LAN-347. The state
 * itself already reads "Yes"; this is the date it was agreed and, where the
 * wording asked for one, the name the player printed under the tick. Values,
 * not a sentence.
 */
function agreementNote(item: OnboardingItemDisplay): string | undefined {
  if (!item.agreement) return undefined;
  const agreed = `Agreed ${shortDay(item.agreement.agreedAt)}`;
  return item.agreement.printedName
    ? `${agreed} · printed name ${item.agreement.printedName}`
    : agreed;
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

  // The agreement's own date and printed name lead, where there is one; the
  // item's state history follows it, unchanged.
  const note = [agreementNote(item), provenanceNote(item)].filter(Boolean).join(" · ") || undefined;

  /**
   * The marker that follows the value — LAN-408. Stewart, "Ops Improvements",
   * 2026-09-21: "the data related to a line be in line, then AFTER that entry
   * or choice, perhaps a required/not required field that is green or red or
   * something to draw attention to the admin."
   *
   * One chip, never two, and only the one thing that asks something of a
   * reader is filled: a required item still outstanding. A required item that
   * is settled, and an item that was never required, are facts, so they stay
   * the outlined neutral the flags already wore. The subscription item keeps
   * its own longer word, because "never blocks activation" is what is true of
   * it and "Not required" would read as though nobody wants the money.
   */
  const marker = item.isSubscription
    ? { status: "never_blocks", label: "Never blocks activation" }
    : item.isRequired
      ? isItemResolved(item.status)
        ? { status: "required", label: "Required" }
        : { status: "required_outstanding", label: "Required" }
      : { status: "not_required", label: "Not required" };

  return (
    <Row label={item.label} note={note}>
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
          sx={{ ...FIELD_EDITOR_SX, minWidth: 220 }}
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
      {/* After the value, in reading order: label, value, marker — LAN-408. */}
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: "center", flexWrap: "wrap", gap: 0.5, ml: 1 }}
      >
        <StatusChip domain="onboardingItem" status={marker.status} label={marker.label} />
      </Stack>
      <FieldStatus error={error} />
    </Row>
  );
}
