import { Notice } from "@/components/notice";
import { Section } from "@/components/section";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { TemplateChangePlan } from "@/lib/services/event-templates";
import {
  changeTouchesNothing,
  draftsHolding,
  draftsTaking,
  draftTakes,
  TEMPLATE_UNTOUCHED_HEADLINE,
  untouchedApproved,
  untouchedPast,
} from "./presentation";

/** W8-03's three panels: what moves, what does not, and what never does. */
export function ChangePlan({
  plan,
  eventTypeLabel,
}: {
  plan: TemplateChangePlan;
  eventTypeLabel: string;
}) {
  const approved = untouchedApproved(plan.untouched.approved, eventTypeLabel);
  const past = untouchedPast(plan.untouched.past, eventTypeLabel);

  return (
    <Stack spacing={2}>
      {plan.fieldChanges.length > 0 || plan.questionChanges.length > 0 ? (
        <Box data-testid="plan-changes">
          {plan.fieldChanges.map((change) => (
            <Typography variant="body2" key={change.field}>
              {`${change.label}: `}
              <Box
                component="span"
                sx={{ textDecoration: "line-through", color: "text.secondary" }}
              >
                {change.from}
              </Box>
              {" → "}
              <strong>{change.to}</strong>
            </Typography>
          ))}
          {plan.questionChanges.map((change) => (
            <Typography variant="body2" key={`${change.kind}:${change.prompt}`}>
              {`Question ${change.kind}: `}
              <strong>{change.prompt}</strong>
            </Typography>
          ))}
        </Box>
      ) : null}

      {plan.audienceBefore.join(", ") !== plan.audienceAfter.join(", ") ? (
        <Typography variant="body2" data-testid="plan-audience-change">
          {`Invites by default: `}
          <Box component="span" sx={{ textDecoration: "line-through", color: "text.secondary" }}>
            {plan.audienceBefore.join(", ") || "Not set"}
          </Box>
          {" → "}
          <strong>{plan.audienceAfter.join(", ") || "Not set"}</strong>
        </Typography>
      ) : null}

      {plan.taking.length > 0 ? (
        <Section title={draftsTaking(plan.taking.length)} testId="plan-taking">
          {plan.taking.map((draft) => (
            <Box key={draft.id} sx={{ mb: 1 }}>
              <Typography variant="body2">
                {draft.name}
                {draft.scheduledOn ? ` · ${draft.scheduledOn}` : ""}
              </Typography>
              {draftTakes(draft).map((takes) => (
                <Typography variant="body2" color="text.secondary" key={takes}>
                  {takes}
                </Typography>
              ))}
            </Box>
          ))}
        </Section>
      ) : (
        <Notice severity="info" testId="plan-touches-nothing">
          {changeTouchesNothing(eventTypeLabel)}
        </Notice>
      )}

      {plan.holding.length > 0 ? (
        <Section title={draftsHolding(plan.holding.length)} testId="plan-holding">
          {plan.holding.map((draft) => (
            <Box key={draft.id} sx={{ mb: 1 }}>
              <Typography variant="body2">
                {draft.name}
                {draft.scheduledOn ? ` · ${draft.scheduledOn}` : ""}
              </Typography>
              {draft.reasons.map((reason) => (
                <Typography variant="body2" color="text.secondary" key={reason}>
                  {reason}
                </Typography>
              ))}
            </Box>
          ))}
        </Section>
      ) : null}

      {approved || past ? (
        <Section title={TEMPLATE_UNTOUCHED_HEADLINE} testId="plan-untouched">
          {approved ? (
            <Typography variant="body2" color="text.secondary">
              {approved}
            </Typography>
          ) : null}
          {past ? (
            <Typography variant="body2" color="text.secondary">
              {past}
            </Typography>
          ) : null}
        </Section>
      ) : null}
    </Stack>
  );
}
