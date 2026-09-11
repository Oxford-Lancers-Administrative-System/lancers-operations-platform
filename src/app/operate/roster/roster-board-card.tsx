import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { PhoneIcon } from "@/components/phone-icon";
import type { RosterBoardRow } from "@/lib/services/roster-board";
import { StatusPill } from "../board-filter-controls";
import { labelFor, MEMBERSHIP_STATUS_LABELS } from "./presentation";

/**
 * The phone card — LAN-186's owner walkthrough, item 15: name, status and the
 * missing-data flag only, no in-cell editing. Decision history: docs/ux/tickets/LAN-186-roster-board.md.
 */
export default function PlayerCard({ row }: { row: RosterBoardRow }) {
  return (
    <Card variant="outlined" sx={{ position: "relative", p: 0 }} data-testid="roster-card">
      <Box
        component="a"
        href={`/operate/roster/${row.membershipId}`}
        data-testid="roster-card-open"
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
              domain="membership"
              status={row.status}
              label={labelFor(MEMBERSHIP_STATUS_LABELS, row.status)}
            />
            {row.missingCount > 0 ? (
              <Chip
                size="small"
                color="warning"
                variant="outlined"
                label={`${row.missingCount} missing`}
                data-testid="card-missing-flag"
              />
            ) : null}
          </Stack>
        </Stack>
      </Box>

      {/* A sibling of the card-opening anchor, never nested inside it — two
          anchors cannot nest, and stacking this one on top by position rather
          than by DOM order is what keeps both tap targets independently real. */}
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
