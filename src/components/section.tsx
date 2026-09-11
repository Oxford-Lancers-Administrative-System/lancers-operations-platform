import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { CLUB, SEMANTIC } from "@/theme-tokens";

/**
 * One card with a heading — LAN-225, brief §2. Two variants: `plain` (an
 * outlined card, `h3` heading) and `banded` (a filled overline band over a
 * tinted body). `collapsible` makes `plain` a disclosure (`<details>`),
 * closed unless `defaultOpen` (player-surfaces finding P8). Band colours are
 * brief §1.5's mapping — never a traffic-light hue; a band is a place, not a
 * verdict.
 *
 * Decision history: docs/ux/tickets/LAN-231-design-rollout.md
 */
export type Band = "person" | "season" | "recruitment" | "onboarding" | "attendance" | "history";

export interface BandColours {
  readonly header: string;
  readonly tint: string;
  /** The opaque version of `tint`, for sticky cells that must hide what scrolls under them. */
  readonly solid: string;
}

export const BAND_COLOURS: Readonly<Record<Band, BandColours>> = Object.freeze({
  person: { header: CLUB.oxfordBlue, tint: "rgba(0, 33, 71, 0.045)", solid: "#F3F5F8" },
  season: { header: CLUB.royalBlue, tint: "rgba(29, 66, 166, 0.045)", solid: "#F4F6FB" },
  recruitment: { header: CLUB.royalBlue, tint: "rgba(29, 66, 166, 0.045)", solid: "#F4F6FB" },
  onboarding: { header: CLUB.oldGold, tint: "rgba(141, 113, 73, 0.07)", solid: "#F8F5F0" },
  attendance: { header: SEMANTIC.neutral.main, tint: "rgba(90, 87, 84, 0.05)", solid: "#F5F5F4" },
  history: { header: SEMANTIC.neutral.main, tint: "rgba(90, 87, 84, 0.05)", solid: "#F5F5F4" },
});

export function Section({
  title,
  variant = "plain",
  band = "person",
  action,
  description,
  collapsible = false,
  defaultOpen = false,
  summary,
  children,
  testId,
  titleTestId,
  headingLevel = 2,
}: {
  title: string;
  variant?: "plain" | "banded";
  /** Which band, when `variant="banded"`. */
  band?: Band;
  /** One control in the heading row, right-aligned. */
  action?: ReactNode;
  /** One sentence under the heading, where the section needs it. Never help copy. */
  description?: string;
  /** Hide the body behind a disclosure. `plain` only — a band is never a control. */
  collapsible?: boolean;
  /** Open on arrival. A long tail is closed; a section the reader came for is open. */
  defaultOpen?: boolean;
  /** What the closed disclosure says, when that is not the title. */
  summary?: string;
  /** Omitted for a section whose heading and description are the whole message (a register panel). */
  children?: ReactNode;
  testId?: string;
  titleTestId?: string;
  /** Nested sections follow their page section in the heading outline. */
  headingLevel?: 2 | 3;
}) {
  if (variant === "banded") {
    const colours = BAND_COLOURS[band];
    return (
      <Paper
        variant="outlined"
        component="section"
        sx={{ overflow: "hidden" }}
        data-testid={testId ? `section-${testId}` : undefined}
        data-band={band}
      >
        <Stack
          direction="row"
          sx={{
            bgcolor: colours.header,
            color: "common.white",
            px: 2,
            py: 0.75,
            minHeight: 36,
            justifyContent: "space-between",
            alignItems: "center",
            gap: 2,
            flexWrap: "wrap",
          }}
        >
          <Typography
            variant="overline"
            component={headingLevel === 2 ? "h2" : "h3"}
            data-testid={titleTestId}
            sx={{ fontWeight: 700, color: "inherit" }}
          >
            {title}
          </Typography>
          {action ?? null}
        </Stack>
        <Box sx={{ bgcolor: colours.tint, px: 2, py: 0.5 }}>{children}</Box>
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
