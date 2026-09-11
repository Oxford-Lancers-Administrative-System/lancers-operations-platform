import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { AudienceMember } from "@/lib/services/event-approval";
import type { AudienceGroupSummary } from "@/lib/services/audience-selection";
import { CAPACITY_LABELS, joinWithAnd, labelFor } from "../presentation";

/**
 * "All active players, all coaches — 35 people".
 *
 * The groups first and the headcount after, which is the order Brian asked for.
 * People chosen by hand belong to no group and are counted rather than named
 * here; the list underneath is where they are read. A partly-selected group is
 * never named, because naming it would say the whole group is invited.
 */
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

/**
 * The named list, used by the confirmation and by the event detail alike.
 *
 * D3 (round 2): the event detail page named a count and then people, with no
 * group named anywhere — "I do see where it got confused because I'm one of
 * the pages the audience is listed above. On the pre-send, it says who's sent
 * to all players, but I wanted it to be here." `groupSummary` is optional
 * because the approval review already states the shape in its own block
 * above this list and does not repeat it here; the event detail has nowhere
 * else to say it, so it passes one and this renders it — `describeAudienceShape`
 * itself is the one place either surface knows how to say it.
 */
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
