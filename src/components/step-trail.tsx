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
 * (player-surfaces finding P18). This is that map, once: one chip per step from
 * the onboarding vocabulary, and the current step on the Sky Blue ground the
 * shell's active navigation item already uses.
 *
 * ## Why it is a grid and not a wrapping row
 *
 * The first draft wrapped. Five steps in a 720px measure fit four across and
 * left **Hudl alone on the second row**, and a lone box at the foot of a map
 * reads as the important one — Brian, 5 September 2026: "on its line on its
 * own, makes it seem like it's super important". At 375px the same wrap put
 * two, two and one, with the same false emphasis on the last.
 *
 * A grid cannot do that. Every step gets an equal column at `sm` and up, so a
 * sequence of any length is one row and no step is singled out by the accident
 * of how many there are; equal columns also make every cell the same height,
 * which the ragged wrap did not. On a phone it is one column and one compact
 * line per step — a checklist, which is what a five-step sequence is when it
 * cannot be a row.
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
              // On a phone the label and its state share one line, so five
              // steps are five short rows rather than five tall boxes.
              alignItems: { xs: "center", sm: "flex-start" },
              justifyContent: { xs: "space-between", sm: "flex-start" },
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
