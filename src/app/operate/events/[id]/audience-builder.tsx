"use client";

import { useActionState, useMemo, useState } from "react";
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
  groupsForEventType,
  groupIsSelected,
  groupSize,
  toggleGroup,
  resolveSelection,
  type AudienceCandidate,
  type AudienceCapacity,
  type AudienceGroupKey,
} from "@/lib/services/audience-selection";
import { saveEventAudienceAction } from "../actions";
import { EMPTY_TRANSITION_STATE } from "../form-state";
import {
  AUDIENCE_BUILDER_HEADLINE,
  CAPACITY_LABELS,
  describeBuilderDefault,
  labelFor,
  TYPE_LABELS,
} from "../presentation";

/**
 * UX-40 — choosing who an event is for.
 *
 * ## What this component owns, and what it deliberately does not
 *
 * It owns a tick list and nothing else. Pressing **Review** posts the selection
 * to `saveEventAudienceAction`, which stores it against the draft and redirects
 * to the confirmation. The confirmation and the empty-audience refusal are
 * server-rendered from the stored rows, not from state in here.
 *
 * That split is the fix for what Brian found: the first version kept the whole
 * audience in this component, so **Edit draft** and back threw it away. A
 * component that holds the only copy of something valuable will eventually lose
 * it. Now the database holds it and this screen is a way to change it.
 *
 * ## Selection starts from what is stored — which since D47 may be the template's
 *
 * `initialKeys` is the audience already stored on the draft. Two things put
 * people there: the operator's own saved work, and the type's template, which
 * supplies a default audience when the draft is created. Both are stored rows by
 * the time this screen opens, so this component does not know or care which.
 *
 * That is the reversal D47 makes to LAN-77, and it is narrower than it looks.
 * ADR 0012's rule is that the *system* never implies an audience, and nothing
 * below implies one: there is still no default group, no whole-roster fallback,
 * and no "if none selected then everyone". A template's default audience is a
 * choice the club made once, on purpose, and the sentence under the heading says
 * which template made it so the approver knows what they are checking.
 *
 * ## Group buttons are toggles, and say what they will do
 *
 * A lit button means every one of that group's people is currently ticked;
 * pressing it again clears them. The lit state is computed from the selection
 * rather than remembered as "which buttons were pressed", because the two
 * disagree the moment somebody unticks one person out of a group — and the
 * button then has to stop claiming the whole group is in.
 *
 * The count on each button is **people**, not rows. Brian's instruction: the
 * club knows what "everyone active" means, and the screen should not explain its
 * own arithmetic. See `groupSize`.
 */

export interface AudienceBuilderProps {
  eventId: string;
  /** Decides which groups are offered: recruits appear on Recruitment (D46). */
  eventType: string;
  candidates: AudienceCandidate[];
  counts: Record<AudienceCapacity, number>;
  /** The audience already saved against this draft. Empty when there is none. */
  initialKeys: string[];
  /** The groups this type's template supplies, for the sentence above (D47). */
  templateGroups: AudienceGroupKey[];
}

const UNITS = ["Both", "Offence", "Defence", "Special teams"] as const;

export function AudienceBuilder({
  eventId,
  eventType,
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

  /** Exactly what saving will store, by the same rules the service applies. */
  const resolution = useMemo(() => resolveSelection(candidates, keys), [candidates, keys]);
  const people = resolution.ok ? resolution.members.length : 0;

  /**
   * Chosen people first, then everybody else, each alphabetically.
   *
   * Brian asked for it and the reason holds up: an audience of forty built out
   * of a roster of forty-five is unreviewable if the ticked names are scattered
   * through the list. Sorting is stable across a toggle because it is derived
   * from the selection, so a name jumps to the top when ticked and back when
   * unticked — which is also the feedback that the tick registered.
   */
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return candidates
      .filter((candidate) => {
        if (capacity !== "all" && candidate.capacity !== capacity) return false;
        if (unit !== "all" && candidate.unit !== unit) return false;
        if (needle === "") return true;
        return (
          candidate.displayName.toLowerCase().includes(needle) ||
          candidate.standing.toLowerCase().includes(needle) ||
          (candidate.contact ?? "").toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => {
        const chosen = Number(selected.has(b.key)) - Number(selected.has(a.key));
        return chosen !== 0 ? chosen : a.displayName.localeCompare(b.displayName);
      });
  }, [candidates, search, capacity, unit, selected]);

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
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
            {describeBuilderDefault(labelFor(TYPE_LABELS, eventType), templateGroupLabels)}
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
            {visible.map((candidate) => (
              <Box
                component="li"
                key={candidate.key}
                sx={{ borderBottom: 1, borderColor: "divider", py: 0.5 }}
              >
                <CheckField
                  name={`candidate-${candidate.key}`}
                  checked={selected.has(candidate.key)}
                  onChange={() => toggle(candidate.key)}
                  inputLabel={`Include ${candidate.displayName} as ${labelFor(CAPACITY_LABELS, candidate.capacity)}`}
                  label={
                    <Box sx={{ py: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {candidate.displayName}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {[
                          labelFor(CAPACITY_LABELS, candidate.capacity),
                          candidate.standing,
                          candidate.unit,
                          candidate.contact,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
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
