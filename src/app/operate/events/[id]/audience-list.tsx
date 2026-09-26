import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { AudienceMember } from "@/lib/services/event-approval";
import type { AudienceGroupSummary } from "@/lib/services/audience-selection";
import { CAPACITY_LABELS, joinWithAnd, labelFor } from "../presentation";

/** "All active players, all coaches — 35 people" — groups first, headcount after (Brian). */
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
 * The chosen groups under the picker's own headings — LAN-414 round 2.
 *
 * The approval review and the event's audience panel used to run the labels
 * together into one sentence, which said nothing about where a group came from:
 * "Offense" and "Kickoff" read alike, and neither told the approver which
 * roster column they were looking at. Same labels as the picker, from the same
 * catalogue, under the same category and sub-category headings — so checking
 * the audience against what was ticked is reading the same words in the same
 * order (docs/ux/standards.md rule 7).
 *
 * Nothing new is derived here: the entries are `summary.named`, already in the
 * catalogue's order, and the headings are the ones the picker's bands carry.
 */
export function AudienceGroupHeadings({
  summary,
  testId,
}: {
  summary: AudienceGroupSummary;
  testId: string;
}) {
  if (summary.named.length === 0) return null;

  // One entry per heading, in first-seen order — which is the catalogue's.
  const headings: { key: string; label: string; labels: string[] }[] = [];
  for (const entry of summary.named) {
    const label =
      entry.subCategoryLabel === null
        ? entry.categoryLabel
        : `${entry.categoryLabel} · ${entry.subCategoryLabel}`;
    const key = `${entry.category}/${entry.subCategory}`;
    const held = headings.find((heading) => heading.key === key);
    if (held) held.labels.push(entry.label);
    else headings.push({ key, label, labels: [entry.label] });
  }

  return (
    <Stack spacing={1} sx={{ mb: 1 }} data-testid={testId}>
      {headings.map((heading) => (
        <Box key={heading.key} data-testid="audience-group-heading" data-heading={heading.key}>
          <Typography variant="overline" color="text.secondary" component="p">
            {heading.label}
          </Typography>
          <Typography variant="body2">{joinWithAnd(heading.labels)}</Typography>
        </Box>
      ))}
    </Stack>
  );
}

/** The named list, used by the confirmation and the event detail alike — D3 round 2. */
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
        <>
          <Typography variant="h6" component="p" sx={{ mb: 1 }} data-testid="audience-shape">
            {describeAudienceShape(groupSummary)}
          </Typography>
          <AudienceGroupHeadings summary={groupSummary} testId="audience-groups-by-category" />
        </>
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
              {/*
                LAN-341: an exited recruit is "No longer listed" — the word the
                read model already uses for them — and not "No longer active",
                which on this screen means somebody who is still invited.
              */}
              {member.exitedRecruit ? (
                <Typography variant="caption" color="text.secondary">
                  No longer listed
                </Typography>
              ) : member.stillSelectable ? null : (
                <Typography variant="caption" color="text.secondary">
                  No longer active
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary">
                {/* LAN-440: a committee-only invitee reads as a player. Display only. */}
                {labelFor(
                  CAPACITY_LABELS,
                  member.capacity === "committee" ? "player" : member.capacity,
                )}
              </Typography>
            </Stack>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
