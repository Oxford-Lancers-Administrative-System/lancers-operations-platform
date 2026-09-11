import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import TableCell from "@mui/material/TableCell";
import Typography from "@mui/material/Typography";
import { PhoneIcon } from "@/components/phone-icon";
import type { RecruitmentBoardRow } from "@/lib/services/recruitment-board";
import {
  ATTENDANCE_LABEL,
  CONSENT_LABELS,
  PROSPECT_STATUS_LABELS,
  RSVP_LABEL,
} from "@/lib/services/recruitment-vocabulary";
import { StatusPill } from "../board-filter-controls";
import { bandColour, rawValue, type ColumnDef } from "./board-columns";
import { displayOf, NOT_RECORDED, optionListLabel } from "./board-data";
import StatusCell from "./status-cell";

/** A filter chip's field label, for the "Filtered by …" row. */
export function labelForKey(key: string, columns: readonly ColumnDef[]): string {
  if (key === "attendedAnyEvent") return "Attended an event";
  return columns.find((column) => column.key === key)?.label ?? key;
}

/** A filter chip's own value label, for the "Filtered by …" row. */
export function filterChipLabel(key: string, value: string, columns: readonly ColumnDef[]): string {
  if (key === "attendedAnyEvent") return value === "yes" ? "Attended" : "Never attended";
  const column = columns.find((c) => c.key === key);
  return column ? optionListLabel(column, value) : value;
}

/**
 * Walk correction (W-2): RSVP/Attendance/yes-no columns render through the
 * club's own `RSVP_LABEL`/`ATTENDANCE_LABEL`, not `displayOf`'s bare `String()`.
 */
function displayText(row: RecruitmentBoardRow, column: ColumnDef): string {
  if (column.key === "consent") return CONSENT_LABELS[row.consent];
  if (column.key === "playedBefore") {
    return row.playedBefore ? RSVP_LABEL[row.playedBefore] : NOT_RECORDED;
  }
  if (column.key === "watchedBefore") {
    return row.watchedBefore ? RSVP_LABEL[row.watchedBefore] : NOT_RECORDED;
  }
  if (column.key.startsWith("event:")) {
    const [, eventId, cell] = column.key.split(":");
    const eventCell = row.events[eventId];
    if (eventCell) {
      if (cell === "rsvp") return eventCell.rsvp ? RSVP_LABEL[eventCell.rsvp] : NOT_RECORDED;
      if (cell === "attendance") {
        return eventCell.attendance ? ATTENDANCE_LABEL[eventCell.attendance] : NOT_RECORDED;
      }
    }
  }
  return displayOf(rawValue(row, column.key));
}

/** One cell — plain text, a record link, or (status only) the click-to-edit pill. */
export function RecruitCell({
  row,
  column,
  bandEnd,
  seasonLabel,
}: {
  row: RecruitmentBoardRow;
  column: ColumnDef;
  /** Whether this column is the last in its band's run — see `bandBoundaryKeys`. */
  bandEnd: boolean;
  seasonLabel: string;
}) {
  const colours = bandColour(column.band);
  const shell = {
    bgcolor: colours.tint,
    minWidth: column.width,
    width: column.width,
    whiteSpace: "nowrap" as const,
    borderRight: bandEnd ? 2 : 0,
    borderRightColor: "background.paper",
  };

  if (column.key === "status") {
    return (
      <TableCell sx={shell}>
        <StatusCell
          prospectId={row.prospectId}
          status={row.status}
          displayName={row.displayName}
          seasonLabel={seasonLabel}
        />
      </TableCell>
    );
  }

  if (column.edit === "record") {
    // `W1`: routes to the person record on click, same as the roster board's person columns.
    const value = displayOf(rawValue(row, column.key));
    return (
      <TableCell sx={shell}>
        <Link
          href={`/operate/recruitment/${row.prospectId}`}
          underline="hover"
          color={value === NOT_RECORDED ? "text.disabled" : "text.primary"}
        >
          {value}
        </Link>
      </TableCell>
    );
  }

  return (
    <TableCell sx={shell}>
      <Typography
        variant="body2"
        color={displayText(row, column) === NOT_RECORDED ? "text.disabled" : "text.primary"}
      >
        {displayText(row, column)}
      </Typography>
    </TableCell>
  );
}

/**
 * The phone card — `W1-01`'s own approved mockup, and `../roster/roster-board.tsx`'s
 * `PlayerCard` (LAN-186, item 15) it is modelled on. Decision history:
 * docs/ux/tickets/LAN-186-roster-board.md (the roster card's paragraph; this card mirrors it).
 */
export function RecruitCard({ row }: { row: RecruitmentBoardRow }) {
  return (
    <Card
      variant="outlined"
      sx={{ position: "relative", p: 0 }}
      data-testid={`recruitment-card-${row.prospectId}`}
    >
      <Box
        component="a"
        href={`/operate/recruitment/${row.prospectId}`}
        data-testid="recruitment-card-open"
        sx={{
          display: "block",
          p: 2,
          pr: 8,
          minHeight: 44,
          textDecoration: "none",
          color: "inherit",
          borderRadius: 1,
          "&:hover": { bgcolor: "action.hover" },
          "&:focus-visible": {
            outline: "2px solid",
            outlineColor: "primary.main",
            outlineOffset: -2,
          },
        }}
      >
        <Stack spacing={1}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {row.displayName}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
            <StatusPill
              domain="recruitment"
              status={row.status}
              label={PROSPECT_STATUS_LABELS[row.status]}
            />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {row.college ?? NOT_RECORDED} · {CONSENT_LABELS[row.consent]}
          </Typography>
        </Stack>
      </Box>

      <Box
        sx={{ position: "absolute", top: 8, right: 8 }}
        onClick={(event) => event.stopPropagation()}
      >
        <Button
          variant="contained"
          component="a"
          href={row.phoneForCall ? `tel:${row.phoneForCall}` : undefined}
          disabled={!row.phoneForCall}
          aria-label="Call"
          onClick={(event) => event.stopPropagation()}
          sx={{
            minHeight: 44,
            minWidth: 44,
            width: 44,
            height: 44,
            p: 0,
            borderRadius: "50%",
          }}
        >
          <PhoneIcon />
        </Button>
      </Box>
    </Card>
  );
}
