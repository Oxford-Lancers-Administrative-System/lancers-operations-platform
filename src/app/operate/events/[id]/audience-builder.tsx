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
 *
 * ## One row per person — LAN-294
 *
 * The catalogue is one row per *capacity*, and this screen used to render it
 * one-to-one, so Bertram (player, President) and Caspian (player, three
 * committee seats) each appeared twice. Brian, 2026-09-10, opening the picker on
 * a practice event: a person appears once, however many roles they hold.
 *
 * So the list is `audiencePeople(candidates)` — the same collapse
 * `resolveSelection` applies to the write, computed by the same rule, so the
 * screen cannot come to a different answer than the transaction. A tick carries
 * **all** of that human's keys in and out together, which is what leaves the
 * group buttons behaving exactly as they did when there were two rows: press
 * *All active committee* and Bertram's committee key goes in; press it again and
 * that key alone comes back out, and he stays in as a player.
 *
 * The count under the list was already people rather than rows, and still is.
 */

export interface AudienceBuilderProps {
  eventId: string;
  /** Decides which groups are offered: recruits appear on Recruitment (D46). */
  eventType: string;
  /** LAN-265. What the club calls this kind of event — the word the note uses. */
  templateName: string;
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

  /** Exactly what saving will store, by the same rules the service applies. */
  const resolution = useMemo(() => resolveSelection(candidates, keys), [candidates, keys]);
  const people = resolution.ok ? resolution.members.length : 0;

  /** The catalogue as humans — one row each, however many capacities they hold. */
  const roster = useMemo(() => audiencePeople(candidates), [candidates]);

  /**
   * Ticked when any of a person's keys is in the selection.
   *
   * One definition, used by the checkbox and by the chosen-first sort: a
   * reloaded draft holds one key per person rather than one per capacity, so
   * "are they in" has to be asked of the whole set and the two must not be able
   * to answer differently.
   */
  const isChosen = useCallback(
    (person: AudiencePerson) => person.keys.some((key) => selected.has(key)),
    [selected],
  );

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
    return roster
      .filter((person) => {
        // A capacity filter asks "is this person a coach", not "is this row a
        // coaching row" — the row is the human now, and hiding a coach who also
        // plays would be a stranger answer than the duplicate rows it replaced.
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

  /**
   * In or out as a whole person.
   *
   * Every key the human holds moves together, so a hand-ticked player who also
   * coaches is in the coaching group's lit state as well — and unticking them
   * takes them out of both, rather than leaving a capacity behind that nothing
   * on screen would then account for.
   */
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
