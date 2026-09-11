"use client";

import { useActionState, useCallback, useMemo, useState } from "react";
import { Notice } from "@/components/notice";
import { Section } from "@/components/section";
import { ActionBar } from "@/components/action-bar";
import { EmptyState } from "@/components/empty-state";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import { Field, SelectField, CheckField } from "@/components/field";
import Typography from "@mui/material/Typography";
import {
  audiencePeople,
  groupsForEventType,
  groupIsSelected,
  groupSize,
  toggleGroup,
  resolveSelection,
  type AudienceCandidate,
  type AudienceCapacity,
  type AudienceGroupKey,
  type AudiencePerson,
} from "@/lib/services/audience-selection";
import { saveEventAudienceAction } from "../actions";
import { EMPTY_TRANSITION_STATE } from "../form-state";
import {
  AUDIENCE_BUILDER_HEADLINE,
  describeAudienceRow,
  describeBuilderDefault,
} from "../presentation";

// UX-40 — choosing who an event is for. Owns a tick list only; the
// confirmation and empty-audience refusal are server-rendered from stored
// rows, not state here (fixes a lost-audience defect Brian found). Since
// D47 the initial selection may be the template's default (ADR 0012: the
// system never implies one). One row per person, not per capacity — LAN-294,
// Brian 2026-09-10; a tick carries all of a person's keys together, the
// same collapse resolveSelection applies to the write. Decision history: docs/adr/0012-explicit-event-audience.md.

export interface AudienceBuilderProps {
  eventId: string;
  eventType: string;
  templateName: string;
  candidates: AudienceCandidate[];
  counts: Record<AudienceCapacity, number>;
  initialKeys: string[];
  templateGroups: AudienceGroupKey[];
}

const UNITS = ["Both", "Offence", "Defence", "Special teams"] as const;

export function AudienceBuilder({
  eventId,
  eventType,
  templateName,
  candidates,
  counts,
  initialKeys,
  templateGroups,
}: AudienceBuilderProps) {
  const groups = groupsForEventType(eventType);
  const templateGroupLabels = groups
    .filter((group) => templateGroups.includes(group.key))
    .map((group) => group.label);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(initialKeys));
  const [search, setSearch] = useState("");
  const [capacity, setCapacity] = useState<"all" | AudienceCapacity>("all");
  const [unit, setUnit] = useState<string>("all");

  const [state, formAction, pending] = useActionState(
    saveEventAudienceAction,
    EMPTY_TRANSITION_STATE,
  );

  const keys = useMemo(() => [...selected], [selected]);

  const resolution = useMemo(() => resolveSelection(candidates, keys), [candidates, keys]);
  const people = resolution.ok ? resolution.members.length : 0;

  const roster = useMemo(() => audiencePeople(candidates), [candidates]);

  const isChosen = useCallback(
    (person: AudiencePerson) => person.keys.some((key) => selected.has(key)),
    [selected],
  );

  // Chosen people first, then everybody else, each alphabetically — Brian
  // asked for it (unreviewable otherwise). Sorted from the selection, so
  // ticking moves a name to the top. Decision history: docs/adr/0012-explicit-event-audience.md.
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return roster
      .filter((person) => {
        if (capacity !== "all" && !person.capacities.includes(capacity)) return false;
        if (unit !== "all" && person.unit !== unit) return false;
        if (needle === "") return true;
        return (
          person.displayName.toLowerCase().includes(needle) ||
          person.standings.some((standing) => standing.toLowerCase().includes(needle)) ||
          (person.contact ?? "").toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => {
        const order = Number(isChosen(b)) - Number(isChosen(a));
        return order !== 0 ? order : a.displayName.localeCompare(b.displayName);
      });
  }, [roster, search, capacity, unit, isChosen]);

  // Every key the human holds moves together, so a coaching lit state stays
  // consistent with a hand-ticked player who also coaches.
  function toggle(person: AudiencePerson) {
    setSelected((current) => {
      const next = new Set(current);
      if (person.keys.some((key) => next.has(key))) {
        for (const key of person.keys) next.delete(key);
      } else {
        for (const key of person.keys) next.add(key);
      }
      return next;
    });
  }

  function pressGroup(groupKey: string) {
    setSelected((current) => toggleGroup(candidates, groupKey, current));
  }

  return (
    <Section title={AUDIENCE_BUILDER_HEADLINE} testId="audience-builder">
      <Stack spacing={3}>
        <Box>
          <Typography variant="body2" color="text.secondary" data-testid="builder-default-note">
            {describeBuilderDefault(templateName, templateGroupLabels)}
          </Typography>
        </Box>

        <Box>
          <Typography variant="overline" color="text.secondary" component="p">
            Add a group
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
            {groups.map((group) => {
              const size = groupSize(candidates, group.key);
              const on = groupIsSelected(candidates, group.key, selected);
              return (
                <Button
                  key={group.key}
                  variant={on ? "contained" : "outlined"}
                  size="small"
                  disabled={size === 0}
                  aria-pressed={on}
                  onClick={() => pressGroup(group.key)}
                  sx={{ minHeight: 40 }}
                >
                  {`${group.label} (${size})`}
                </Button>
              );
            })}
            <Button
              variant="text"
              size="small"
              color="error"
              disabled={selected.size === 0}
              onClick={() => setSelected(new Set())}
              sx={{ minHeight: 40 }}
            >
              Clear selection
            </Button>
          </Stack>
        </Box>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <Field
            label="Search name, role or contact"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <SelectField
            label="Capacity"
            value={capacity}
            onChange={(event) => setCapacity(event.target.value as "all" | AudienceCapacity)}
            options={[
              { value: "all", label: "All" },
              { value: "player", label: `Players (${counts.player})` },
              { value: "coach", label: `Coaches (${counts.coach})` },
              { value: "committee", label: `Committee (${counts.committee})` },
              ...(counts.recruit > 0
                ? [{ value: "recruit", label: `Recruits (${counts.recruit})` }]
                : []),
            ]}
          />
          <SelectField
            label="Unit"
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            options={[
              { value: "all", label: "All" },
              ...UNITS.map((value) => ({ value, label: value })),
            ]}
          />
        </Stack>

        <Divider />

        {visible.length === 0 ? (
          <Stack spacing={1}>
            <EmptyState
              title="Nobody matches those filters."
              searched={search || undefined}
              testId="no-candidates"
            />
            <Button
              onClick={() => {
                setSearch("");
                setCapacity("all");
                setUnit("all");
              }}
            >
              Clear filters
            </Button>
          </Stack>
        ) : (
          <Stack
            component="ul"
            sx={{ listStyle: "none", p: 0, m: 0 }}
            data-testid="candidate-list"
            spacing={0}
          >
            {visible.map((person) => (
              <Box
                component="li"
                key={person.personId}
                sx={{ borderBottom: 1, borderColor: "divider", py: 0.5 }}
              >
                <CheckField
                  name={`candidate-${person.personId}`}
                  checked={isChosen(person)}
                  onChange={() => toggle(person)}
                  inputLabel={`Include ${person.displayName} — ${describeAudienceRow(person)}`}
                  label={
                    <Box sx={{ py: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {person.displayName}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {describeAudienceRow(person)}
                      </Typography>
                    </Box>
                  }
                />
              </Box>
            ))}
          </Stack>
        )}

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
