import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { CLUB, RADIUS } from "@/theme-tokens";
import { StatusChip } from "./status-chip";

/**
 * Where the reader is in a sequence they cannot see the end of — LAN-225,
 * the player-surfaces addendum.
 *
 * The kit had no way to say "five steps, this is the second, these three are
 * still owed". The questionnaire at `/me/[token]/details` needs exactly that,
 * and built it inline as a five-column `<dl>` of 11px labels over 13px values
 * that collapses to two columns on a phone and reads as a table of facts
 * rather than as a path (player-surfaces finding P4). This is that map, once:
 * one chip per step from the onboarding vocabulary, the current step on the
 * Sky Blue ground the shell's active navigation item already uses, and a
 * wrapping row rather than a grid so five steps never become a five-row list
 * at 375px.
 *
 * It is a map, not a control: no step is a link. A sequence that lets its
 * reader jump about is a different component and a product decision nobody
 * has taken.
 */
export interface TrailStep {
  readonly label: string;
  /** A code in the `onboardingItem` vocabulary — what colours the chip. */
  readonly status: string;
  /**
   * The club's word for that state, in this sequence's own vocabulary
   * ("Saved", "Agreed", "Claimed"). Required for the same reason
   * `StatusChip`'s own label is: colour is never the only signal.
   */
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
    <Stack
      direction="row"
      component="ol"
      sx={{ listStyle: "none", m: 0, p: 0, flexWrap: "wrap", gap: 1 }}
      data-testid={testId ?? "step-trail"}
    >
      {steps.map((step, index) => {
        const current = index === currentIndex;
        return (
          <Box
            key={step.label}
            component="li"
            aria-current={current ? "step" : undefined}
            data-current={current ? "true" : undefined}
            sx={{
              flex: "1 1 128px",
              minWidth: 0,
              px: 1.25,
              py: 1,
              borderRadius: `${RADIUS.control}px`,
              border: "1px solid",
              borderColor: current ? CLUB.oxfordBlue : "divider",
              bgcolor: current ? CLUB.skyBlue : "transparent",
            }}
          >
            <Typography
              variant="overline"
              component="p"
              sx={{ color: current ? CLUB.oxfordBlue : "text.secondary", lineHeight: 1.4 }}
            >
              {index + 1}. {step.label}
            </Typography>
            <Box sx={{ mt: 0.5 }}>
              <StatusChip domain="onboardingItem" status={step.status} label={step.statusLabel} />
            </Box>
          </Box>
        );
      })}
    </Stack>
  );
}
