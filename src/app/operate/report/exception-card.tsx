"use client";

import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ExceptionSection } from "@/lib/services/weekly-report";
import { formatDayAndMonth, OPEN_STORED_LIST } from "./presentation";

/**
 * One exception category — a card on UX-80, and a card with a stored list on
 * UX-81.
 *
 * ## Why the list opens in place
 *
 * UX-81's **Open stored list** has to lead somewhere, and everywhere it could
 * lead is out of scope: follow-up actions are the next slice's, export is
 * explicitly excluded, and a per-section route is a screen nobody registered.
 * So it opens the stored list where it stands. That keeps the promise the label
 * makes — the reader gets the names — while reading only the content already in
 * the snapshot, which is the property the whole screen exists to have.
 *
 * ## The approval defect is not styled like the others
 *
 * Section 6 is the one exception that is nobody's chase. The issue is explicit
 * that uninvited audience members must be "surfaced separately from
 * nonresponders, and labelled as an approval defect rather than as a chase", so
 * the card says so in a chip rather than relying on its position in a list —
 * position is the first thing a responsive reflow takes away.
 */
export function ExceptionCard({
  section,
  title,
  showList,
  anchorId,
}: {
  section: ExceptionSection;
  title: string;
  /** UX-81 opens the stored names; UX-80's preview shows counts only. */
  showList: boolean;
  anchorId?: string;
}) {
  const heading = (
    <Stack spacing={0.5}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
        <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        {section.isApprovalDefect ? (
          <Chip
            label="Approval defect"
            size="small"
            color="warning"
            variant="outlined"
            data-testid={`approval-defect-${section.key}`}
          />
        ) : null}
      </Stack>
      <Typography variant="body2" color="text.secondary">
        {section.summary}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {section.note}
      </Typography>
    </Stack>
  );

  if (!showList) {
    return (
      <Paper
        variant="outlined"
        id={anchorId}
        sx={{ p: 2 }}
        data-testid={`exception-${section.key}`}
        data-count={section.count}
      >
        {heading}
      </Paper>
    );
  }

  return (
    <Accordion
      id={anchorId}
      disableGutters
      variant="outlined"
      data-testid={`exception-${section.key}`}
      data-count={section.count}
      sx={{ "&::before": { display: "none" } }}
    >
      <AccordionSummary
        sx={{ minHeight: 56 }}
        aria-label={`${OPEN_STORED_LIST} — ${title}`}
        data-testid={`open-stored-list-${section.key}`}
      >
        <Stack spacing={0.5} sx={{ width: "100%" }}>
          {heading}
          <Typography variant="body2" color="primary" sx={{ fontWeight: 600 }}>
            {OPEN_STORED_LIST}
          </Typography>
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        {section.items.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Nothing stored under this heading.
          </Typography>
        ) : (
          <Box component="ul" sx={{ listStyle: "none", p: 0, m: 0 }}>
            {section.items.map((item, index) => (
              <Box
                component="li"
                key={`${section.key}-${index}`}
                sx={{ py: 1, borderTop: index === 0 ? 0 : 1, borderColor: "divider" }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {item.person ?? item.event ?? "Unnamed"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {[item.person ? item.event : null, formatDayAndMonth(item.on), item.detail]
                    .filter((part) => part !== null && part !== "")
                    .join(" · ")}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </AccordionDetails>
    </Accordion>
  );
}
