import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { Section } from "@/components/section";
import type { ParticipationPerson } from "@/lib/services/participation-view";
import { responseNamesByCapacity, type ResponseNameSection } from "@/lib/services/response-names";

/**
 * LAN-458: every invitee's name under their answer, on the operator event page
 * only — the Event info link page renders the response blocks but not this.
 * Every name is shown.
 *
 * Brian's visual review (5 October 2026): the lists sit in one collapsible
 * section headed "Attendance", open on arrival — the same plain disclosure
 * the event page and the player record already use. The response blocks with
 * the counts stay above and outside the section, so they still show when it
 * is closed.
 *
 * LAN-481 (Brian, 6 and 7 October 2026): inside it, one closed disclosure per
 * capacity the blocks show — Recruits, Players, Coaches — each holding that
 * capacity's names under Yes, No and No response. Yes and No sit side by
 * side at every width, a phone included; No response runs full width below
 * them, its names in the same two columns.
 */
export function ResponseNames({ people }: { people: readonly ParticipationPerson[] }) {
  const sections = responseNamesByCapacity(people);
  if (sections.length === 0) return null;

  return (
    <Section title="Attendance" testId="response-names" collapsible defaultOpen>
      <Stack spacing={1.5} data-testid="response-names">
        {sections.map((section) => (
          <Section
            key={section.capacity}
            title={section.label}
            testId={`response-names-${section.capacity}`}
            collapsible
            headingLevel={3}
          >
            <CapacityNames section={section} />
          </Section>
        ))}
      </Stack>
    </Section>
  );
}

function CapacityNames({ section }: { section: ResponseNameSection }) {
  return (
    <Box
      data-testid={`response-names-${section.capacity}-grid`}
      sx={{
        display: "grid",
        columnGap: { xs: 2, sm: 3 },
        rowGap: 1.5,
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      }}
    >
      {section.groups.map((group) => {
        const fullWidth = group.group === "none";
        return (
          <Box
            key={group.group}
            sx={{ minWidth: 0, gridColumn: fullWidth ? "1 / -1" : undefined }}
            data-testid={`response-names-${section.capacity}-${group.group}`}
            data-count={group.names.length}
          >
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {`${group.label} · ${group.names.length}`}
            </Typography>
            <Box
              component="ul"
              sx={{
                m: 0,
                mt: 0.5,
                p: 0,
                listStyle: "none",
                ...(fullWidth ? { columnCount: 2, columnGap: { xs: 2, sm: 3 } } : {}),
              }}
            >
              {group.names.map((name, at) => (
                <Typography
                  key={`${name}:${at}`}
                  component="li"
                  variant="body2"
                  sx={{ overflowWrap: "anywhere", breakInside: "avoid" }}
                >
                  {name}
                </Typography>
              ))}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
