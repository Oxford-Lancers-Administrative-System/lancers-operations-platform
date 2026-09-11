/**
 * Steps 4 and 5 — BUCS Play and Hudl, the two trust-claim steps. Split from
 * `page.tsx` (LAN-300).
 */
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
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
  BUCS_OWED_NOTE,
  BUCS_STATUS_CONFIRMED_BY,
  BUCS_STATUS_CONFIRMED_BY_LABEL,
  BUCS_STATUS_INSTRUCTIONS,
  BUCS_STATUS_INSTRUCTIONS_LABEL,
  BUCS_STEPS,
  CONTINUE,
  FINISH,
  HUDL_ARE_YOU_IN,
  HUDL_CLAIM_LABEL,
  HUDL_HEADING,
  HUDL_LEAD,
  HUDL_NO_INVITATION_LABEL,
  HUDL_OWED_NOTE,
  HUDL_STEPS,
  HUDL_TWO_PARTS_NOTE,
  stepLabel,
} from "./presentation";
import { BucsHudlShell, itemIsSettled, itemStepWord } from "./step-shell";

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
        [BUCS_STATUS_INSTRUCTIONS_LABEL, BUCS_STATUS_INSTRUCTIONS, false],
      ]}
    >
      <ol style={{ margin: 0, paddingLeft: 22 }}>
        {BUCS_STEPS.map((line) => (
          <li key={line} style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 8 }}>
            {line}
          </li>
        ))}
      </ol>
      <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 1 }}>
        {BUCS_OWED_NOTE}
      </Typography>
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

export function HudlStepPage({ view, token }: { view: QuestionnaireView; token: string }) {
  return (
    <BucsHudlShell
      view={view}
      step="hudl"
      token={token}
      heading={HUDL_HEADING}
      lead={HUDL_LEAD}
      code="hudl_access"
    >
      <Notice severity="info">{HUDL_TWO_PARTS_NOTE}</Notice>
      <ol style={{ margin: 0, paddingLeft: 22 }}>
        {HUDL_STEPS.map((line) => (
          <li key={line} style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 8 }}>
            {line}
          </li>
        ))}
      </ol>
      <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 1 }}>
        {HUDL_OWED_NOTE}
      </Typography>
      <Typography component="h2" sx={{ fontSize: 16, fontWeight: 700, mt: 3 }}>
        {HUDL_ARE_YOU_IN}
      </Typography>
      <CheckField name="claim" label={HUDL_CLAIM_LABEL} />
      <CheckField name="no_invitation" label={HUDL_NO_INVITATION_LABEL} />
      <Box sx={{ mt: 2 }}>
        <Button type="submit" variant="contained" sx={{ minHeight: 48 }}>
          {FINISH}
        </Button>
      </Box>
    </BucsHudlShell>
  );
}
