import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { StatusChip } from "@/components/status-chip";
import type { OtherSeasonSummary } from "@/lib/services/player-record";
import { labelFor, MEMBERSHIP_STATUS_LABELS } from "../presentation";

/** Every other season this person has held, linking to that season's own record. */
export default function OtherSeasons({ seasons }: { seasons: readonly OtherSeasonSummary[] }) {
  if (seasons.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ py: 2 }} data-testid="no-other-seasons">
        No earlier seasons are recorded.
      </Typography>
    );
  }
  return (
    <Stack data-testid="other-seasons">
      {seasons.map((season, index) => (
        <Stack
          key={season.membershipId}
          direction="row"
          sx={{
            justifyContent: "space-between",
            alignItems: "center",
            py: 1.25,
            borderTop: index === 0 ? "none" : 1,
            borderColor: "divider",
          }}
        >
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              <Box
                component="a"
                href={`/operate/roster/${season.membershipId}`}
                sx={{ color: "primary.main", textDecoration: "none" }}
              >
                {season.seasonLabel}
              </Box>
            </Typography>
            {season.blueJerseyNumber ? (
              <Typography variant="caption" color="text.secondary">
                Blue {season.blueJerseyNumber}
              </Typography>
            ) : null}
          </Box>
          <StatusChip
            domain="membership"
            status={season.status}
            label={labelFor(MEMBERSHIP_STATUS_LABELS, season.status)}
          />
        </Stack>
      ))}
    </Stack>
  );
}
