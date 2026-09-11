import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { AudienceMember } from "@/lib/services/event-approval";
import type { AudienceGroupSummary } from "@/lib/services/audience-selection";
import { CAPACITY_LABELS, joinWithAnd, labelFor } from "../presentation";

/** "All active players, all coaches — 35 people" — groups first, headcount after (Brian). Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md. */
export function describeAudienceShape(summary: AudienceGroupSummary): string {
  const people = `${summary.total} ${summary.total === 1 ? "person" : "people"}`;
  const parts = [...summary.groups];
  if (summary.others > 0) {
    parts.push(
      parts.length === 0
        ? `${summary.others} chosen by hand`
        : `${summary.others} more chosen by hand`,
    );
  }
  return parts.length === 0 ? people : `${joinWithAnd(parts)} — ${people}`;
}

/** The named list, used by the confirmation and the event detail alike — D3 round 2. Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md. */
export function AudienceList({
  audience,
  groupSummary,
  heading,
  testId,
}: {
  audience: AudienceMember[];
  groupSummary?: AudienceGroupSummary;
  heading: string;
  testId: string;
}) {
  return (
    <Box>
      <Typography variant="overline" color="text.secondary" component="p">
        {heading}
      </Typography>
      {groupSummary ? (
        <Typography variant="h6" component="p" sx={{ mb: 1 }} data-testid="audience-shape">
          {describeAudienceShape(groupSummary)}
        </Typography>
      ) : null}
      <Stack component="ul" spacing={0} sx={{ listStyle: "none", p: 0, m: 0 }} data-testid={testId}>
        {audience.map((member) => (
          <Box
            component="li"
            key={member.id}
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: 1,
              alignItems: "center",
              justifyContent: "space-between",
              py: 1,
              borderBottom: 1,
              borderColor: "divider",
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {member.displayName}
            </Typography>
            <Stack direction="row" spacing={1}>
              {member.stillSelectable ? null : (
                <Typography variant="caption" color="text.secondary">
                  No longer active
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary">
                {labelFor(CAPACITY_LABELS, member.capacity)}
              </Typography>
            </Stack>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
