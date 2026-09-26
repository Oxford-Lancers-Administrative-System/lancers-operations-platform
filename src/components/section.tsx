import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Band } from "./band-colours";
import BandedSection from "./banded-section";
import { LockIcon } from "./lock-icon";

export { BAND_COLOURS, type Band } from "./band-colours";

/**
 * One card with a heading — LAN-225, brief §2. Two variants: `plain` (an
 * outlined card, `h3` heading) and `banded` (a filled overline band over a
 * tinted body). `collapsible` makes `plain` a disclosure (`<details>`),
 * closed unless `defaultOpen` (player-surfaces finding P8). A band is a
 * place, not a verdict. LAN-430: the ten roster groups wear the colour the
 * club chose (`./band-colours.ts`); the banded variant renders on the client
 * (`./banded-section.tsx`) so it can read them.
 */
export function Section({
  title,
  variant = "plain",
  band = "person",
  action,
  description,
  collapsible = false,
  defaultOpen = false,
  onToggleOpen,
  summary,
  children,
  testId,
  titleTestId,
  headingLevel = 2,
  locked = false,
}: {
  title: string;
  variant?: "plain" | "banded";
  /** Which band, when `variant="banded"`. */
  band?: Band;
  /** One control in the heading row, right-aligned. */
  action?: ReactNode;
  /** One sentence under the heading, where the section needs it. Never help copy. */
  description?: string;
  /** Hide the body behind a disclosure. LAN-387: a banded roster group takes it too, so the band is the control. */
  collapsible?: boolean;
  /** Open on arrival. A long tail is closed; a section the reader came for is open. */
  defaultOpen?: boolean;
  /**
   * Told each time the reader opens or closes this section — LAN-387, Brian's
   * visual pass item 1, where the roster's groups remember their state on the
   * operator's account. The disclosure stays uncontrolled: `<details>` already
   * holds its own state and this only reports it, so a save that is slow or
   * fails never leaves the section disagreeing with the click that opened it.
   * Only a client caller may pass it.
   */
  onToggleOpen?: (open: boolean) => void;
  /** What the closed disclosure says, when that is not the title. */
  summary?: string;
  /** Omitted for a section whose heading and description are the whole message (a register panel). */
  children?: ReactNode;
  testId?: string;
  titleTestId?: string;
  /** Nested sections follow their page section in the heading outline. */
  headingLevel?: 2 | 3;
  /**
   * LAN-432 — the reader's seat holds None on this section's category. The
   * section stays in its place with its head, a lock where the chevron was, no
   * action and no body; it cannot be opened. The caller passes no children:
   * a locked section's contents are never sent to the browser.
   */
  locked?: boolean;
}) {
  if (variant === "banded") {
    return (
      <BandedSection
        title={title}
        band={band}
        action={action}
        collapsible={collapsible}
        defaultOpen={defaultOpen}
        onToggleOpen={onToggleOpen}
        testId={testId}
        titleTestId={titleTestId}
        headingLevel={headingLevel}
        locked={locked}
      >
        {locked ? null : children}
      </BandedSection>
    );
  }

  if (locked) {
    return (
      <Paper
        variant="outlined"
        component="section"
        sx={{ p: { xs: 2, md: 3 } }}
        data-testid={testId ? `section-${testId}` : undefined}
        data-locked="true"
      >
        <Stack
          direction="row"
          spacing={2}
          sx={{ justifyContent: "space-between", alignItems: "center", gap: 1 }}
        >
          <Typography
            variant="h3"
            component={headingLevel === 2 ? "h2" : "h3"}
            data-testid={titleTestId}
          >
            {title}
          </Typography>
          <LockIcon />
        </Stack>
      </Paper>
    );
  }

  const head = (
    <Stack
      direction="row"
      spacing={2}
      sx={{
        justifyContent: "space-between",
        alignItems: "flex-start",
        mb: children && !collapsible ? 2 : 0,
        flexWrap: collapsible ? "nowrap" : "wrap",
        gap: 1,
      }}
    >
      <Box sx={{ minWidth: 0, flex: collapsible ? 1 : undefined }}>
        <Typography
          variant="h3"
          component={headingLevel === 2 ? "h2" : "h3"}
          data-testid={titleTestId}
        >
          {summary ?? title}
        </Typography>
        {description ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {description}
          </Typography>
        ) : null}
      </Box>
      {action ?? null}
      {collapsible ? (
        <Box
          component="span"
          aria-hidden="true"
          data-disclosure-indicator
          sx={{
            width: 12,
            height: 12,
            mt: 0.25,
            mr: 0.5,
            flexShrink: 0,
            borderRight: "2px solid",
            borderBottom: "2px solid",
            borderColor: "primary.main",
            transform: "rotate(45deg)",
          }}
        />
      ) : null}
    </Stack>
  );

  if (collapsible) {
    return (
      <Paper
        component="details"
        variant="outlined"
        open={defaultOpen || undefined}
        // LAN-403: a plain disclosure reports its state the same way a banded
        // one does, so the record's own sections are remembered on the
        // operator's account exactly as its roster groups are.
        onToggle={
          onToggleOpen
            ? (event) => onToggleOpen((event.currentTarget as HTMLDetailsElement).open)
            : undefined
        }
        sx={{
          p: { xs: 2, md: 3 },
          "& > summary": { cursor: "pointer", listStyle: "none" },
          "& > summary::-webkit-details-marker": { display: "none" },
          "& > summary:focus-visible": {
            outline: "2px solid",
            outlineColor: "primary.light",
            outlineOffset: 4,
            borderRadius: 1,
          },
          "&[open] > summary": { mb: 2 },
          "&[open] > summary [data-disclosure-indicator]": {
            transform: "translateY(6px) rotate(225deg)",
          },
        }}
        data-testid={testId ? `section-${testId}` : undefined}
      >
        <Box component="summary">{head}</Box>
        {children}
      </Paper>
    );
  }

  return (
    <Paper
      variant="outlined"
      component="section"
      sx={{ p: { xs: 2, md: 3 } }}
      data-testid={testId ? `section-${testId}` : undefined}
    >
      {head}
      {children}
    </Paper>
  );
}

/** A labelled group within a section, such as one emergency contact. */
export function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box
      component="fieldset"
      sx={{ m: 0, minWidth: 0, border: 1, borderColor: "divider", borderRadius: 1, p: 2 }}
    >
      <Typography component="legend" variant="subtitle2" sx={{ px: 0.5 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}
