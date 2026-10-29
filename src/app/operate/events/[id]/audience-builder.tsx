"use client";

import { useActionState, useMemo } from "react";
import { Notice } from "@/components/notice";
import { Section } from "@/components/section";
import { ActionBar } from "@/components/action-bar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  audienceOptionsForEventType,
  resolveSelection,
  type AudienceCandidate,
  type AudienceCapacity,
} from "@/lib/services/audience-selection";
import { AudienceChooser, useAudienceChoice } from "../audience-chooser";
import { saveEventAudienceAction } from "../actions";
import { EMPTY_TRANSITION_STATE } from "../form-state";
import { AUDIENCE_BUILDER_HEADLINE, describeBuilderDefault } from "../presentation";

// UX-40 — choosing who an event is for. Owns a tick list only; the
// confirmation and empty-audience refusal are server-rendered from stored
// rows, not state here (fixes a lost-audience defect Brian found). Since
// D47 the initial selection may be the template's default (ADR 0012: the
// system never implies one). One row per person, not per capacity — LAN-294,
// Brian 2026-09-10; a tick carries all of a person's keys together, the
// same collapse resolveSelection applies to the write.

export interface AudienceBuilderProps {
  eventId: string;
  eventType: string;
  templateName: string;
  candidates: AudienceCandidate[];
  counts: Record<AudienceCapacity, number>;
  initialKeys: string[];
  /** LAN-392: the group pills this audience was last saved with. */
  initialGroups: string[];
  templateGroups: string[];
}

export function AudienceBuilder({
  eventId,
  eventType,
  templateName,
  candidates,
  counts,
  initialKeys,
  initialGroups,
  templateGroups,
}: AudienceBuilderProps) {
  const templateGroupLabels = audienceOptionsForEventType(eventType)
    .filter((option) => templateGroups.includes(option.token))
    .map((option) => option.label);
  // LAN-392 / LAN-414 round 2: the ticked groups are remembered, never inferred —
  // they are what the event's live rule is built from after approval.
  const choice = useAudienceChoice(initialKeys, initialGroups);
  const { selected, pressedGroups } = choice;

  const [state, formAction, pending] = useActionState(
    saveEventAudienceAction,
    EMPTY_TRANSITION_STATE,
  );

  const keys = useMemo(() => [...selected], [selected]);
  const resolution = useMemo(() => resolveSelection(candidates, keys), [candidates, keys]);
  const people = resolution.ok ? resolution.members.length : 0;

  return (
    <Section title={AUDIENCE_BUILDER_HEADLINE} testId="audience-builder">
      <Stack spacing={3}>
        <Box>
          <Typography variant="body2" color="text.secondary" data-testid="builder-default-note">
            {describeBuilderDefault(templateName, templateGroupLabels)}
          </Typography>
        </Box>

        <AudienceChooser
          eventType={eventType}
          candidates={candidates}
          counts={counts}
          choice={choice}
        />

        {state.error ? (
          <Notice severity="error" testId="audience-save-error">
            {state.error}
          </Notice>
        ) : null}

        <Box component="form" action={formAction}>
          <input type="hidden" name="eventId" value={eventId} />
          {keys.map((key) => (
            <input key={key} type="hidden" name="audienceKey" value={key} />
          ))}
          {[...pressedGroups].map((group) => (
            <input key={group} type="hidden" name="audienceGroup" value={group} />
          ))}
          <ActionBar
            primary={
              <Button
                type="submit"
                variant="contained"
                disabled={pending}
                data-testid="review-selection"
              >
                {pending ? "Saving…" : `Review ${people} selected`}
              </Button>
            }
            cancel={
              <Button variant="outlined" href={`/operate/events/${eventId}`} disabled={pending}>
                Cancel
              </Button>
            }
          />
        </Box>
      </Stack>
    </Section>
  );
}
