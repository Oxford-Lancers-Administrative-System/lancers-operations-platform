import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TableCell from "@mui/material/TableCell";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { StatusPill } from "../board-filter-controls";
import { bandOf, type ColumnDef } from "./board-columns";
import { displayOf, NOT_RECORDED, onboardingLabel, optionListLabel, rawValue } from "./board-data";
import JerseyPicker from "./jersey-picker";
import { labelFor, MEMBERSHIP_STATUS_LABELS } from "./presentation";
import type { FormalwearItemKey, RosterBoardRow } from "@/lib/services/roster-board";

const AVAILABILITY_COLOUR: Readonly<Record<string, string>> = Object.freeze({
  green: "#2e7d32",
  orange: "#ed6c02",
  red: "#c62828",
});

/** Links into the queue LAN-184 owns — LAN-186's own words: "if this package lands first, the link arrives with it." */
const MISSING_DATA_ROUTE = "/operate/people/missing";

/** One board cell: read-only value, or (when `editing`) the column's own control. */
export function Cell({
  row,
  column,
  editing,
  holders,
  canManageStatus,
  bandEnd,
  onOpen,
  onClose,
  onCommit,
  onToggleFormalwear,
}: {
  row: RosterBoardRow;
  column: ColumnDef;
  editing: boolean;
  holders?: Record<string, string>;
  canManageStatus: boolean;
  /** Whether this column is the last in its band's run — see `bandBoundaryKeys`. */
  bandEnd: boolean;
  onOpen: () => void;
  onClose: () => void;
  onCommit: (next: string | string[]) => void;
  onToggleFormalwear: (item: FormalwearItemKey, owned: boolean) => void;
}) {
  const band = bandOf(column.band);
  const shell = {
    bgcolor: band.tint,
    minWidth: column.width,
    width: column.width,
    whiteSpace: "nowrap" as const,
    // The same seam the band header draws, carried into the body so all three
    // boundaries — Person|Onboarding, Onboarding|Season — read with equal
    // weight instead of only the always-bordered Player column looking
    // separated (LAN-186 item 12).
    borderRight: bandEnd ? 2 : 0,
    borderRightColor: "background.paper",
  };

  if (editing) {
    if (column.edit === "jersey") {
      const held = column.key === "blueNumbers" ? row.blueNumbers : row.whiteNumbers;
      return (
        <TableCell sx={shell}>
          <JerseyPicker
            held={held}
            holders={holders ?? {}}
            onCommit={onCommit}
            onClose={onClose}
            width={column.width}
          />
        </TableCell>
      );
    }

    if (column.edit === "multiselect") {
      const current = row.formalwear;
      return (
        <TableCell sx={shell}>
          <Select
            size="small"
            open
            multiple
            value={(Object.keys(current) as FormalwearItemKey[]).filter((key) => current[key])}
            onClose={onClose}
            renderValue={(value) => (value as string[]).join(", ") || "—"}
            sx={{ width: Math.max(column.width - 24, 64) }}
          >
            {(column.options ?? []).map((option) => {
              const key = option as FormalwearItemKey;
              return (
                <MenuItem
                  key={option}
                  value={option}
                  onClick={() => onToggleFormalwear(key, !current[key])}
                >
                  <Checkbox size="small" sx={{ p: 0, mr: 1 }} checked={current[key]} />
                  <ListItemText primary={column.optionLabels?.[option] ?? option} />
                </MenuItem>
              );
            })}
          </Select>
        </TableCell>
      );
    }

    // The open list of choices reads `optionListLabel` — the label alone
    // (LAN-186 item 9), except for a position column, whose options carry the
    // code *and* the full name (Brian's walkthrough of the built board). The
    // selected value shown when the dropdown is closed is `displayOf` below,
    // unaffected: item 7's cell half — the code alone for a position — still
    // stands.
    const current = rawValue(row, column.key);
    return (
      <TableCell sx={shell}>
        <Select
          size="small"
          open
          autoFocus
          value={(current as string) ?? ""}
          onClose={onClose}
          onChange={(event) => {
            onCommit(event.target.value);
            onClose();
          }}
          renderValue={() => displayOf(row, column)}
          sx={{ width: Math.max(column.width - 24, 64) }}
        >
          {column.key === "status" || column.edit === "onboarding" ? null : (
            <MenuItem value="">
              <em>{NOT_RECORDED}</em>
            </MenuItem>
          )}
          {(column.options ?? []).map((option) => (
            <MenuItem key={option} value={option}>
              {optionListLabel(column, option)}
            </MenuItem>
          ))}
        </Select>
      </TableCell>
    );
  }

  const editable =
    (column.edit === "select" ||
      column.edit === "multiselect" ||
      column.edit === "jersey" ||
      column.edit === "onboarding") &&
    (column.key !== "status" || canManageStatus) &&
    // Correction round 2, item 5: a column whose item this membership has
    // not (yet) had generated has nothing to edit — same posture as every
    // other absent value on this board, never a control that would refuse.
    (column.edit !== "onboarding" ||
      (column.itemCode ? Boolean(row.onboardingItems[column.itemCode]) : false)) &&
    // D-002 (correction round 3, Q-14): Subscription paid opens no control at
    // all until Subscription invoiced is complete — there is nothing to
    // record payment against yet, and the service itself refuses the write
    // this cell would otherwise offer.
    (column.key !== "subsPaid" || row.onboardingItems["subs_invoiced"]?.status === "complete");

  return (
    <TableCell
      sx={{
        ...shell,
        cursor: editable ? "pointer" : "default",
        "&:hover": editable
          ? { outline: "1px solid", outlineColor: "primary.light", outlineOffset: -1 }
          : undefined,
      }}
      onClick={editable ? onOpen : undefined}
      data-testid={editable ? "editable-cell" : undefined}
    >
      <CellValue row={row} column={column} />
    </TableCell>
  );
}

function CellValue({ row, column }: { row: RosterBoardRow; column: ColumnDef }) {
  if (column.key === "contactable") {
    if (!row.hasMobile && !row.hasEmail)
      return (
        <Typography variant="body2" color="text.disabled">
          —
        </Typography>
      );
    return (
      <Stack direction="row" spacing={0.5}>
        {row.hasMobile ? <Chip size="small" variant="outlined" label="Mobile" /> : null}
        {row.hasEmail ? <Chip size="small" variant="outlined" label="Email" /> : null}
      </Stack>
    );
  }

  if (column.key === "missing") {
    if (row.missingCount === 0)
      return (
        <Typography variant="body2" color="text.disabled">
          —
        </Typography>
      );
    return (
      <Chip
        component="a"
        href={MISSING_DATA_ROUTE}
        clickable
        size="small"
        color="warning"
        variant="outlined"
        label={row.missingCount}
        data-testid="missing-count"
      />
    );
  }

  if (column.key === "onboarding") {
    return <Typography variant="body2">{onboardingLabel(row)}</Typography>;
  }

  if (column.key === "status") {
    // The board's one status-pill formula (`../board-filter-controls.tsx`) —
    // the single exception to "plain text like every other select cell",
    // kept because a status is the fact an operator scans the whole row
    // for. Editing still opens the identical generic dropdown every other
    // season fact uses.
    return (
      <StatusPill
        domain="membership"
        status={row.status}
        label={labelFor(MEMBERSHIP_STATUS_LABELS, row.status)}
      />
    );
  }

  if (column.key === "availability" && row.availability) {
    return (
      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
        <Box
          aria-hidden
          sx={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            bgcolor: AVAILABILITY_COLOUR[row.availability],
          }}
        />
        <Typography variant="body2">{displayOf(row, column)}</Typography>
      </Stack>
    );
  }

  const text = displayOf(row, column);
  if (column.edit === "record") {
    return (
      <Tooltip title="Opens the person record — W2's rules apply" placement="top">
        <Typography
          variant="body2"
          sx={{
            color: text === NOT_RECORDED ? "text.disabled" : "text.primary",
            textDecoration: text === NOT_RECORDED ? "none" : "underline dotted",
            textUnderlineOffset: 3,
          }}
          component="a"
          href={`/operate/roster/${row.membershipId}`}
        >
          {text}
        </Typography>
      </Tooltip>
    );
  }

  return (
    <Typography
      variant="body2"
      sx={{ color: text === NOT_RECORDED ? "text.disabled" : "text.primary" }}
    >
      {text}
    </Typography>
  );
}
