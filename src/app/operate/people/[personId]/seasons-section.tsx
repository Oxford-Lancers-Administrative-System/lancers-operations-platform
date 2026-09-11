import { Section } from "@/components/section";
import { StatusChip } from "@/components/status-chip";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { PersonSeasonRecord } from "@/lib/services/people-directory";
import {
  labelFor as membershipLabelFor,
  MEMBERSHIP_STATUS_LABELS,
} from "../../roster/presentation";

/** "Their seasons" — every season membership, linking to its roster record. */
export default function SeasonsSection({ seasons }: { seasons: readonly PersonSeasonRecord[] }) {
  return (
    <Section variant="banded" band="season" title="Their seasons">
      {seasons.length === 0 ? (
        <Typography color="text.secondary">None</Typography>
      ) : (
        <Stack>
          {seasons.map((season) => (
            <Stack
              key={season.membershipId}
              direction="row"
              spacing={2}
              sx={{
                justifyContent: "space-between",
                alignItems: "center",
                py: 1.25,
                borderBottom: 1,
                borderColor: "divider",
                "&:last-child": { borderBottom: 0 },
              }}
            >
              <Button
                href={`/operate/roster/${season.membershipId}`}
                sx={{ p: 0, minHeight: 0, textTransform: "none", fontWeight: 600 }}
              >
                {season.seasonLabel}
              </Button>
              <StatusChip
                domain="membership"
                status={season.status}
                label={membershipLabelFor(MEMBERSHIP_STATUS_LABELS, season.status)}
              />
            </Stack>
          ))}
        </Stack>
      )}
    </Section>
  );
}
