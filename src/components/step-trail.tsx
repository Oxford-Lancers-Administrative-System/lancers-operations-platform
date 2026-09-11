import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { CLUB, RADIUS } from "@/theme-tokens";
import { StatusChip } from "./status-chip";

/**
 * Where the reader is in a sequence they cannot see the end of — LAN-225.
 * See `docs/architecture/components.md` and `docs/ux/design-system.md` § 5.
 * A grid, not a wrapping row (Brian, 5 September 2026: a lone last box "makes
 * it seem like it's super important"). A map, not a control: no step links.
 */
export interface TrailStep {
  readonly label: string;
  /** A code in the `onboardingItem` vocabulary — what colours the chip. */
  readonly status: string;
  /** The club's word for that state ("Saved", "Agreed", "Claimed") — colour is never the only signal. */
  readonly statusLabel: string;
}

export function StepTrail({
  steps,
  currentIndex,
  testId,
}: {
  steps: readonly TrailStep[];
  /** Which step the reader is on. `-1` for a summary that is on none of them. */
  currentIndex: number;
  testId?: string;
}) {
  return (
    <Box
      component="ol"
      sx={{
        listStyle: "none",
        m: 0,
        p: 0,
        display: "grid",
        gap: 1,
        gridTemplateColumns: {
          xs: "1fr",
          sm: `repeat(${steps.length}, minmax(0, 1fr))`,
        },
      }}
      data-testid={testId ?? "step-trail"}
    >
      {steps.map((step, index) => {
        const current = index === currentIndex;
        return (
          <Stack
            key={step.label}
            component="li"
            aria-current={current ? "step" : undefined}
            data-current={current ? "true" : undefined}
            direction={{ xs: "row", sm: "column" }}
            spacing={{ xs: 1.5, sm: 0.5 }}
            sx={{
              minWidth: 0,
              px: 1.25,
              py: 1,
              borderRadius: `${RADIUS.control}px`,
              border: "1px solid",
              borderColor: current ? CLUB.oxfordBlue : "divider",
              bgcolor: current ? CLUB.skyBlue : "transparent",
              alignItems: { xs: "center", sm: "flex-start" }, // phone: label and state share one line
              justifyContent: "space-between",
            }}
          >
            <Typography
              variant="overline"
              component="p"
              sx={{
                color: current ? CLUB.oxfordBlue : "text.secondary",
                lineHeight: 1.4,
                minWidth: 0,
              }}
            >
              {index + 1}. {step.label}
            </Typography>
            <Box sx={{ flexShrink: 0 }}>
              <StatusChip domain="onboardingItem" status={step.status} label={step.statusLabel} />
            </Box>
          </Stack>
        );
      })}
    </Box>
  );
}
