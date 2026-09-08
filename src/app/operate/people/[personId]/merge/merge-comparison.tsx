"use client";

import { useActionState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { Field } from "@/components/field";
import { ActionBar } from "@/components/action-bar";
import { PageHeader } from "@/components/page-header";
import { Notice } from "@/components/notice";
import { Section } from "@/components/section";
import { RowCard } from "@/components/row-card";
import { ValueChoice } from "@/components/value-choice";
import { NotRecorded } from "@/components/fact";
import Typography from "@mui/material/Typography";

import type { PersonMergePreview } from "@/lib/services/person-merge";
import { submitMerge } from "./actions";
import { INITIAL_MERGE_STATE } from "./merge-state";

/** `public.messaging_consent_state`, for the operator-choosable comparison row B-003 adds. */
const CONSENT_STATE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  never_asked: "Never asked",
  asked: "Asked",
  granted: "Granted",
  refused: "Refused",
  withdrawn: "Withdrawn",
});

/**
 * W4-02 … W4-08 — the comparison, field by field, and the confirmation that
 * moves nothing until the operator has answered every one of them. `Q-5`
 * (Brian, 2026-08-29) in full: two refusals, a required reason, what will
 * move shown before it moves, no undo.
 */
export default function MergeComparison({
  survivorRouteId,
  preview,
}: {
  /** The person id this route was opened on — the default survivor. */
  survivorRouteId: string;
  preview: PersonMergePreview;
}) {
  const [state, formAction, pending] = useActionState(submitMerge, INITIAL_MERGE_STATE);
  const { survivor, loser, refusal } = preview;

  return (
    <Box component="form" action={formAction} sx={{ maxWidth: 960 }}>
      <input type="hidden" name="survivorPersonId" value={survivor.personId} />
      <input type="hidden" name="loserPersonId" value={loser.personId} />

      <Stack spacing={3}>
        <PageHeader
          title="Merge two records"
          back={{
            href: `/operate/people/${survivorRouteId}`,
            label: `Back to ${survivor.displayName}`,
          }}
        />

        {state.formError ? <Notice severity="warning">{state.formError}</Notice> : null}

        {refusal ? (
          <Stack spacing={2}>
            <Notice severity="warning" testId="merge-refusal">
              {refusal.message}
            </Notice>
            <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", gap: 1 }}>
              {refusal.rule === "person_merge_active_operator_seat" ? (
                <Button variant="contained" href="/operate/admin/operators">
                  Open operator administration
                </Button>
              ) : null}
              {/* Q-16, LAN-185 correction round 2: the refusal links to the
                  exact membership to archive, not a bare "open the roster" —
                  the same shape the active-seat refusal's link already had. */}
              {refusal.blockingMemberships?.map((blocking) => (
                <Button
                  key={blocking.membershipId}
                  variant="contained"
                  href={`/operate/roster/${blocking.membershipId}`}
                  data-testid="merge-refusal-membership-link"
                >
                  Open the {blocking.seasonLabel} membership
                </Button>
              ))}
            </Stack>
          </Stack>
        ) : (
          <>
            <Section title="Which record survives">
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <SurvivorCard label={survivor.displayName} isSurvivor />
                <SurvivorCard
                  label={loser.displayName}
                  swapHref={`/operate/people/${loser.personId}/merge?with=${survivor.personId}`}
                />
              </Stack>
            </Section>

            <Section title="What each record says">
              <Stack spacing={2}>
                {preview.fields.map((field) => (
                  <CompareRow
                    key={field.field}
                    name={`field_${field.field}`}
                    label={field.label}
                    differs={field.differs}
                    survivorValue={field.survivorValue}
                    loserValue={field.loserValue}
                  />
                ))}
                {preview.contacts.map((contact) => (
                  <CompareRow
                    key={contact.kind}
                    name={`contact_${contact.kind}`}
                    label={contact.label}
                    differs={contact.differs}
                    survivorValue={contact.survivor?.rawValue ?? null}
                    loserValue={contact.loser?.rawValue ?? null}
                  />
                ))}
                <CompareRow
                  name="field_aliases"
                  label="Aliases"
                  // D-001 (correction round 3, Q-14): two identical alias
                  // sets are not a difference — the real, set-wise
                  // computation from `previewPersonMerge`, not a hardcoded
                  // `true` that fired even when both sides were empty.
                  differs={preview.aliases.differs}
                  survivorValue={preview.aliases.survivorAliases.join(" · ") || null}
                  loserValue={preview.aliases.loserAliases.join(" · ") || null}
                  readOnly
                />
                {/* B-003 (correction round 2, Q-10, Brian: "If it is a merge,
                    they obviously get to choose") — `WP-operator-record`
                    (LAN-217). Operator-choosable like any other field or
                    contact row above: no state is imposed automatically.
                    Supersedes `T07-merge-precedence`, which was locked at a
                    recommendation, not an owner decision. */}
                {preview.consentCombinations.map((combo) => (
                  <CompareRow
                    key={`consent_${combo.seasonId}`}
                    name={`consent_${combo.seasonId}`}
                    label={`Messaging consent · ${combo.seasonLabel}`}
                    differs={combo.survivorState !== combo.loserState}
                    survivorValue={CONSENT_STATE_LABELS[combo.survivorState] ?? combo.survivorState}
                    loserValue={CONSENT_STATE_LABELS[combo.loserState] ?? combo.loserState}
                  />
                ))}
              </Stack>
              {preview.aliases.survivorAliases.length > 0 ||
              preview.aliases.loserAliases.length > 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                  Aliases from both records are kept on the survivor as dedupe evidence.
                </Typography>
              ) : null}
            </Section>

            {preview.prospectCombinations.length > 0 ? (
              <Section
                title={`Two prospect records for ${preview.prospectCombinations[0].seasonLabel}`}
              >
                <Typography variant="body2" color="text.secondary">
                  Combined onto the survivor: earliest first contact, furthest-along status. One
                  prospect record per person per season.
                </Typography>
              </Section>
            ) : null}

            {preview.willMove.length > 0 ? (
              <Section title={`What will move onto ${survivor.displayName}`}>
                <Stack spacing={1}>
                  {preview.willMove.map((line) => (
                    <Typography key={line.label} variant="body2">
                      {line.count} {line.label}
                      {line.count === 1 ? "" : "s"}
                    </Typography>
                  ))}
                </Stack>
              </Section>
            ) : null}

            {/* Q-16, LAN-185 correction round 2: an archived overlap
                membership stays on {loser.displayName} — never re-pointed —
                said plainly here before the merge, per Brian's own words. */}
            {preview.staysWithLoser.length > 0 ? (
              <Section title={`What stays on ${loser.displayName}`}>
                <Stack spacing={1}>
                  {preview.staysWithLoser.map((line) => (
                    <Typography
                      key={line.seasonLabel}
                      variant="body2"
                      data-testid="stays-with-loser"
                    >
                      The {line.seasonLabel} membership, archived — not moved onto{" "}
                      {survivor.displayName}.
                    </Typography>
                  ))}
                </Stack>
              </Section>
            ) : null}

            <Section title="Why">
              <Field
                name="reason"
                label="Reason"
                required
                error={Boolean(state.reasonError)}
                helperText={
                  state.reasonError ??
                  "There is no undo. The losing row is kept, dated, and points at the survivor."
                }
              />
            </Section>
          </>
        )}
        <ActionBar
          primary={
            <Button type="submit" variant="contained" disabled={pending || Boolean(refusal)}>
              Merge
            </Button>
          }
          cancel={<Button href={`/operate/people/${survivorRouteId}`}>Cancel</Button>}
        />
      </Stack>
    </Box>
  );
}

function SurvivorCard({
  label,
  isSurvivor,
  swapHref,
}: {
  label: string;
  isSurvivor?: boolean;
  swapHref?: string;
}) {
  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <RowCard
        title={label}
        emphasized={isSurvivor}
        sublines={isSurvivor ? ["Survivor"] : []}
        actions={!isSurvivor ? <Button href={swapHref}>Make this the survivor</Button> : undefined}
      />
    </Box>
  );
}

function CompareRow({
  name,
  label,
  differs,
  survivorValue,
  loserValue,
  readOnly,
}: {
  name: string;
  label: string;
  differs: boolean;
  survivorValue: string | null;
  loserValue: string | null;
  readOnly?: boolean;
}) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={2}
      sx={{ alignItems: { sm: "flex-start" } }}
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{ width: { sm: 190 }, flexShrink: 0, alignItems: "center" }}
      >
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        {differs ? (
          <Typography variant="caption" color="text.secondary">
            differs
          </Typography>
        ) : null}
      </Stack>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ width: "100%" }}>
        <ValueChoice
          name={readOnly ? undefined : name}
          value="survivor"
          text={survivorValue ?? <NotRecorded />}
          defaultSelected
        />
        <ValueChoice
          name={readOnly ? undefined : name}
          value="loser"
          text={loserValue ?? <NotRecorded />}
        />
      </Stack>
    </Stack>
  );
}
