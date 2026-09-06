import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { CLUB, SEMANTIC } from "@/theme-tokens";

/**
 * One card with a heading — LAN-225, brief §2. Replaces the six local
 * `Section`s, the record shell's banded card and the admin panels (audit A1).
 *
 * Two variants, same padding:
 *
 *   - `plain` — an outlined card with an `h3` heading. Forms, panels, the
 *     people record, the admin record.
 *   - `banded` — a filled overline band over a tinted body. The record language
 *     the roster board and the player record share; recruitment reads it too.
 *
 * `collapsible` makes a `plain` section a disclosure: the heading row becomes
 * the `<summary>` of a `<details>`, closed unless `defaultOpen`. It exists
 * because two surfaces already hide a long tail behind one — `/me/[token]`'s
 * "See what else is coming up" and the record's own history — and both built
 * it by hand out of `<details>` with `listStyle: none` and a webkit marker
 * reset (player-surfaces finding P8). A section that hides its body is still a
 * section; nothing else about it changes.
 *
 * The bands and their colours are the brief's §1.5 mapping and nothing else:
 * `person` Oxford Blue, `season` and `recruitment` Royal Blue, `onboarding`
 * Old Gold, `history` and `attendance` neutral. The purple attendance band is
 * gone; a band never carries a traffic-light hue because a band is a place,
 * not a verdict.
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
        mb: children ? 2 : 0,
        flexWrap: "wrap",
        gap: 1,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
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
