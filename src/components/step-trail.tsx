import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { CLUB, RADIUS } from "@/theme-tokens";
import { StatusChip } from "./status-chip";

/**
 * Where the reader is in a sequence they cannot see the end of — LAN-225.
 * See `docs/architecture/components.md` and `docs/ux/design-system.md` § 5.
 * A grid, not a wrapping row (Brian, 5 September 2026: a lone last box "makes
 * it seem like it's super important").
 *
 * It was a map and not a control until LAN-362, which is exactly the complaint:
 * it reads as navigation, so it is navigation. A step carrying an `href` is a
 * link; one without is plain text with its status word, for a sequence whose
 * own rules gate a step. Marking the current step is not the same as disabling
 * it — clicking the step you are on is a reload, and taking that link away
 * would make the strip read as a row of controls with one broken.
 */
export interface TrailStep {
  readonly label: string;
  /** A code in the `onboardingItem` vocabulary — what colours the chip. */
  readonly status: string;
  /** The club's word for that state ("Saved", "Agreed", "Claimed") — colour is never the only signal. */
  readonly statusLabel: string;
  /** Where this step lives. Absent for a step the sequence will not open yet. */
  readonly href?: string;
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

        // One box, whether or not it is a link. The anchor takes no size of its
        // own and the box fills it either way, so a linked step and a plain one
        // are the same width — which is what keeps the strip to one row per
        // step at 375 and one row for the lot above it.
        const box = (
          <Stack
            direction={{ xs: "row", sm: "column" }}
            spacing={{ xs: 1.5, sm: 0.5 }}
            sx={{
              flex: 1,
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

        return (
          <Box
            key={step.label}
            component="li"
            aria-current={current ? "step" : undefined}
            data-current={current ? "true" : undefined}
            sx={{ minWidth: 0, display: "flex" }}
          >
            {step.href ? (
              // MUI's own `href`, not `component={Link}`: this renders from a
              // Server Component, and the kit does not pull next/link through a
              // client boundary to draw a link.
              <Link
                href={step.href}
                underline="none"
                sx={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  color: "inherit",
                  borderRadius: `${RADIUS.control}px`,
                  "&:hover > *": { borderColor: CLUB.oxfordBlue },
                }}
              >
                {box}
              </Link>
            ) : (
              box
            )}
          </Box>
        );
      })}
    </Box>
  );
}
