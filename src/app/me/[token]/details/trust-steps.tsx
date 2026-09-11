/**
 * Steps 4 and 5 — BUCS Play and Hudl, the two trust-claim steps. Split from
 * `page.tsx` (LAN-300). Both sets of instructions are the club's own since
 * LAN-333; `presentation.ts` holds the words and this file only lays them out.
 */
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { Notice } from "@/components/notice";
import { CheckField } from "@/components/field";

import type { QuestionnaireView } from "@/lib/services/player-questionnaire";

import {
  BUCS_CLAIM_LABEL,
  BUCS_CLAIM_SUBNOTE,
  BUCS_CONTINUE_ANYWAY_NOTE,
  BUCS_HAVE_YOU_DONE_IT,
  BUCS_HEADING,
  BUCS_LEAD,
  BUCS_STATUS_CONFIRMED_BY,
  BUCS_STATUS_CONFIRMED_BY_LABEL,
  BUCS_STATUS_INSTRUCTIONS,
  BUCS_STATUS_INSTRUCTIONS_LABEL,
  bucsSteps,
  CONTINUE,
  FINISH,
  HUDL_ARE_YOU_IN,
  HUDL_CLAIM_LABEL,
  HUDL_HEADING,
  HUDL_LEAD,
  HUDL_LINK_NOT_PUBLISHED,
  hudlSteps,
  stepLabel,
  type InstructionStep,
} from "./presentation";
import { BucsHudlShell, itemIsSettled, itemStepWord } from "./step-shell";

/**
 * One numbered list of instructions. A step's destinations are rendered as
 * links after its sentence rather than pasted into it, so a 375px screen wraps
 * on the label and never on a bare URL.
 */
function Instructions({ steps, testId }: { steps: readonly InstructionStep[]; testId: string }) {
  return (
    <ol style={{ margin: 0, paddingLeft: 22 }} data-testid={testId}>
      {steps.map((step) => (
        <li key={step.text} style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 8 }}>
          {step.text}
          {step.links ? (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mt: 0.5 }}>
              {step.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  variant="body2"
                  rel="noopener noreferrer"
                  target="_blank"
                  sx={{ overflowWrap: "anywhere" }}
                >
                  {link.label}
                </Link>
              ))}
            </Box>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

// Step 4 — BUCS Play

export function BucsStepPage({ view, token }: { view: QuestionnaireView; token: string }) {
  const photoReleaseAgreed = view.itemStatus.photo_release === "complete";
  // LAN-289's same one source, so this box and the navigator directly above it
  // cannot say different things about the same item.
  const bucs = view.itemStatus.bucs_play;
  return (
    <BucsHudlShell
      view={view}
      step="bucs_play"
      token={token}
      heading={BUCS_HEADING}
      lead={BUCS_LEAD}
      statusRows={[
        [
          stepLabel("photo_release"),
          photoReleaseAgreed ? "Agreed" : "Outstanding",
          photoReleaseAgreed,
        ],
        [stepLabel("bucs_play"), itemStepWord("bucs_play", bucs ?? "pending"), itemIsSettled(bucs)],
        [BUCS_STATUS_CONFIRMED_BY_LABEL, BUCS_STATUS_CONFIRMED_BY],
        // LAN-333 wrote the instructions, so this row is no longer a fault.
        [BUCS_STATUS_INSTRUCTIONS_LABEL, BUCS_STATUS_INSTRUCTIONS, true],
      ]}
    >
      {/* The league is season-stamped; the year comes off the open season's label, never a constant. */}
      <Instructions steps={bucsSteps(view.seasonLabel)} testId="bucs-steps" />
      <Typography component="h2" sx={{ fontSize: 16, fontWeight: 700, mt: 3 }}>
        {BUCS_HAVE_YOU_DONE_IT}
      </Typography>
      <CheckField name="claim" label={BUCS_CLAIM_LABEL} />
      <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.5 }}>
        {BUCS_CLAIM_SUBNOTE}
      </Typography>
      <Box sx={{ mt: 2 }}>
        <Button type="submit" variant="contained" sx={{ minHeight: 48 }}>
          {CONTINUE}
        </Button>
      </Box>
      <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 2, textAlign: "center" }}>
        {BUCS_CONTINUE_ANYWAY_NOTE}
      </Typography>
    </BucsHudlShell>
  );
}

// Step 5 — Hudl

/**
 * LAN-333. Hudl is self-serve: the player follows the club's join link and the
 * club sends nothing. The screen used to describe an invitation an operator
 * never sent, and offered "No invitation has reached me" for a thing that
 * could not arrive — both are gone, along with the second checkbox and the
 * action branch behind it. `joinLink` is `null` until `HUDL_JOIN_LINK` is
 * configured; the steps still render and the missing link is stated.
 */
export function HudlStepPage({
  view,
  token,
  joinLink,
}: {
  view: QuestionnaireView;
  token: string;
  joinLink: string | null;
}) {
  return (
    <BucsHudlShell
      view={view}
      step="hudl"
      token={token}
      heading={HUDL_HEADING}
      lead={HUDL_LEAD}
      code="hudl_access"
    >
      <Instructions steps={hudlSteps(joinLink)} testId="hudl-steps" />
      {joinLink === null ? (
        <Box sx={{ mt: 2 }}>
          <Notice severity="info" testId="hudl-link-missing">
            {HUDL_LINK_NOT_PUBLISHED}
          </Notice>
        </Box>
      ) : null}
      <Typography component="h2" sx={{ fontSize: 16, fontWeight: 700, mt: 3 }}>
        {HUDL_ARE_YOU_IN}
      </Typography>
      <CheckField name="claim" label={HUDL_CLAIM_LABEL} />
      <Box sx={{ mt: 2 }}>
        <Button type="submit" variant="contained" sx={{ minHeight: 48 }}>
          {FINISH}
        </Button>
      </Box>
    </BucsHudlShell>
  );
}
