/**
 * The two non-sequence landings: everything answered ("Done"), and nothing
 * outstanding at all ("Already complete"). Split from `page.tsx` (LAN-300).
 */
import Link from "@mui/material/Link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Surface } from "@/components/surface";

import type { QuestionnaireView } from "@/lib/services/player-questionnaire";

import {
  ALREADY_COMPLETE_CHANGE_NOTE,
  ALREADY_COMPLETE_HEADING,
  ALREADY_COMPLETE_REST_NOTE,
  CLOSE,
  CONSENT_HEADING,
  DONE_HEADING,
  DONE_STATUS_LABEL,
  IF_SOMETHING_WRONG_BODY,
  IF_SOMETHING_WRONG_HEADING,
  OUTSTANDING_HEADING,
  OUTSTANDING_SAME_LINK_NOTE,
  PRIVACY_NOTE,
  R3G_REASSURANCE,
  stepLabel,
  WHAT_CLUB_HAS_BODY,
  WHAT_CLUB_HAS_HEADING,
} from "./presentation";
import { itemIsSettled, itemStepWord, QuestionnaireStatus } from "./step-shell";

// Done — outstanding by section, each a link back to its step

/** F3 (LAN-230): "5 September 2026" — the person/date line's own format. */
function formatLongDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "Europe/London" }).format(
    date,
  );
}

export function DonePage({ view, token }: { view: QuestionnaireView; token: string }) {
  const consentGiven = !view.needsConsentStep;
  const codeOfConductAgreed = view.itemStatus.code_of_conduct === "complete";
  const photoReleaseAgreed = view.itemStatus.photo_release === "complete";
  // LAN-289's one source again, for the two items that have more states than
  // "done or not": this list is read directly under the navigator's own.
  const bucs = view.itemStatus.bucs_play;
  const hudl = view.itemStatus.hudl_access;

  return (
    <>
      <Surface>
        <Typography variant="overline" color="text.secondary">
          {DONE_STATUS_LABEL(view.seasonLabel)}
        </Typography>
        <PageHeader title={DONE_HEADING} />
        <Typography sx={{ fontSize: 14, color: "text.secondary", mt: 1 }}>
          {view.person.displayName}
          {view.lastAnsweredAt ? ` · ${formatLongDate(view.lastAnsweredAt)}` : null}
        </Typography>
        <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 1.5 }}>
          {PRIVACY_NOTE}
        </Typography>
      </Surface>
      <QuestionnaireStatus
        rows={[
          [CONSENT_HEADING, consentGiven ? "Given" : "Outstanding", consentGiven],
          [
            stepLabel("details"),
            view.detailsComplete ? "Saved" : "Still needed",
            view.detailsComplete,
          ],
          [
            stepLabel("code_of_conduct"),
            codeOfConductAgreed ? "Agreed" : "Outstanding",
            codeOfConductAgreed,
          ],
          [
            stepLabel("photo_release"),
            photoReleaseAgreed ? "Agreed" : "Outstanding",
            photoReleaseAgreed,
          ],
          [
            stepLabel("bucs_play"),
            itemStepWord("bucs_play", bucs ?? "pending"),
            itemIsSettled(bucs),
          ],
          [stepLabel("hudl"), itemStepWord("hudl_access", hudl ?? "pending"), itemIsSettled(hudl)],
        ]}
      />
      {view.outstandingSections.length > 0 ? (
        <Section title={OUTSTANDING_HEADING}>
          {view.outstandingSections.map((group) => (
            <Box key={group.section} sx={{ mb: 2 }}>
              <Typography
                sx={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "text.secondary",
                  mb: 0.5,
                }}
              >
                {group.section}
              </Typography>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {group.items.map((item) => (
                  <li key={item.label} style={{ fontSize: 14, marginBottom: 4 }}>
                    <Link href={`/me/${encodeURIComponent(token)}/details?step=${item.step}`}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </Box>
          ))}
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            {OUTSTANDING_SAME_LINK_NOTE}
          </Typography>
        </Section>
      ) : null}
      <Section title={WHAT_CLUB_HAS_HEADING}>
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>{WHAT_CLUB_HAS_BODY}</Typography>
      </Section>
      <Section title={IF_SOMETHING_WRONG_HEADING}>
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
          {IF_SOMETHING_WRONG_BODY}
        </Typography>
      </Section>
      <Surface>
        <Button component="span" variant="contained" fullWidth sx={{ minHeight: 48 }}>
          {CLOSE}
        </Button>
      </Surface>
      <Typography sx={{ fontSize: 13, color: "text.secondary", textAlign: "center" }}>
        {R3G_REASSURANCE}
      </Typography>
    </>
  );
}

// Already complete — nothing outstanding, no sequence

export function AlreadyCompletePage() {
  return (
    <>
      <Surface>
        <PageHeader title={ALREADY_COMPLETE_HEADING} />
        <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 1.5 }}>
          {PRIVACY_NOTE}
        </Typography>
      </Surface>
      <Surface>
        <Typography sx={{ fontSize: 14, mb: 2 }}>{ALREADY_COMPLETE_REST_NOTE}</Typography>
        <Typography sx={{ fontSize: 14 }}>{ALREADY_COMPLETE_CHANGE_NOTE}</Typography>
      </Surface>
    </>
  );
}
