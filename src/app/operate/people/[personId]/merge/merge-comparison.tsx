"use client";

import { useActionState, useState } from "react";
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

import type { MergeChoice, PersonMergePreview } from "@/lib/services/person-merge";
import { submitMerge } from "./actions";
import { INITIAL_MERGE_STATE } from "./merge-state";

/** One comparison row, whatever it compares — a person field, a contact point, or a season's consent. */
interface ComparisonRow {
  /** The radio group's form name, and the key the answer is held under. */
  name: string;
  label: string;
  /** B-004's warning chip: both sides hold a value and they disagree. */
  differs: boolean;
  /** LAN-256: the two sides do not hold the same value, so this row is a question. */
  needsChoice: boolean;
  survivorValue: string | null;
  loserValue: string | null;
}

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
 * moves nothing until every row is answered (Q-5). LAN-256: agreeing rows
 * render one value; disagreeing rows render unselected and block Merge.
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
  const [answers, setAnswers] = useState<Record<string, MergeChoice>>({});
  const { survivor, loser, refusal } = preview;

  const valueRows: ComparisonRow[] = [
    ...preview.fields.map((field) => ({
      name: `field_${field.field}`,
      label: field.label,
      differs: field.differs,
      needsChoice: field.needsChoice,
      survivorValue: field.survivorValue,
      loserValue: field.loserValue,
    })),
    ...preview.contacts.map((contact) => ({
      name: `contact_${contact.kind}`,
      label: contact.label,
      differs: contact.differs,
      needsChoice: contact.needsChoice,
      survivorValue: contact.survivor?.rawValue ?? null,
      loserValue: contact.loser?.rawValue ?? null,
    })),
  ];

  // B-003 (Q-10): operator-choosable like any other row.
  const consentRows: ComparisonRow[] = preview.consentCombinations.map((combo) => ({
    name: `consent_${combo.seasonId}`,
    label: `Messaging consent · ${combo.seasonLabel}`,
    differs: combo.survivorState !== combo.loserState,
    needsChoice: combo.survivorState !== combo.loserState,
    survivorValue: CONSENT_STATE_LABELS[combo.survivorState] ?? combo.survivorState,
    loserValue: CONSENT_STATE_LABELS[combo.loserState] ?? combo.loserState,
  }));

  const unanswered = [...valueRows, ...consentRows].filter(
    (row) => row.needsChoice && answers[row.name] === undefined,
  );

  function answer(name: string, choice: string): void {
    setAnswers((previous) => ({ ...previous, [name]: choice as MergeChoice }));
  }

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
              {/* Q-16, LAN-185 round 2: links to the exact membership to archive. */}
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
                {valueRows.map((row) => (
                  <CompareRow
                    key={row.name}
                    row={row}
                    answer={answers[row.name]}
                    onAnswer={answer}
                  />
                ))}
                <CompareRow
                  row={{
                    name: "field_aliases",
                    label: "Aliases",
                    // D-001 (Q-14): real set-wise diff from previewPersonMerge, not a hardcoded true.
                    differs: preview.aliases.differs,
                    // Never a choice: both sides' aliases are kept on the
                    // survivor, so there is nothing to decide between.
                    needsChoice: false,
                    survivorValue: preview.aliases.survivorAliases.join(" · ") || null,
                    loserValue: preview.aliases.loserAliases.join(" · ") || null,
                  }}
                  bothSidesAlways
                />
                {consentRows.map((row) => (
                  <CompareRow
                    key={row.name}
                    row={row}
                    answer={answers[row.name]}
                    onAnswer={answer}
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

            {/* Q-16, LAN-185 round 2: archived overlap membership stays on the loser. */}
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
            <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
              <Button
                type="submit"
                variant="contained"
                disabled={pending || Boolean(refusal) || unanswered.length > 0}
              >
                Merge
              </Button>
              {/* Why the button is disabled, as a count rather than a
                  sentence — LAN-256. Absent once every question is answered. */}
              {!refusal && unanswered.length > 0 ? (
                <Typography variant="body2" color="text.secondary" data-testid="merge-unanswered">
                  {unanswered.length} unanswered
                </Typography>
              ) : null}
            </Stack>
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

/**
 * One row of the comparison — three shapes decided by data, not a caller
 * flag: agreed values render as one; a question renders two unselected
 * sides; aliases always show both sides, un-choosable (both kept either way).
 */
function CompareRow({
  row,
  answer,
  onAnswer,
  bothSidesAlways,
}: {
  row: ComparisonRow;
  answer?: MergeChoice;
  onAnswer?: (name: string, choice: string) => void;
  bothSidesAlways?: boolean;
}) {
  const { name, label, differs, needsChoice, survivorValue, loserValue } = row;
  const agreed = !needsChoice && !bothSidesAlways;

  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={2}
      sx={{ alignItems: { sm: "flex-start" } }}
      data-testid={`compare-row-${name}`}
      data-needs-choice={needsChoice ? "true" : "false"}
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
      {agreed ? (
        <Stack sx={{ width: "100%" }}>
          <Typography variant="body2" sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
            {survivorValue ?? <NotRecorded />}
          </Typography>
        </Stack>
      ) : (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ width: "100%" }}>
          <ValueChoice
            name={bothSidesAlways ? undefined : name}
            value="survivor"
            text={survivorValue ?? <NotRecorded />}
            checked={answer === "survivor"}
            onSelect={(value) => onAnswer?.(name, value)}
          />
          <ValueChoice
            name={bothSidesAlways ? undefined : name}
            value="loser"
            text={loserValue ?? <NotRecorded />}
            checked={answer === "loser"}
            onSelect={(value) => onAnswer?.(name, value)}
          />
        </Stack>
      )}
    </Stack>
  );
}
