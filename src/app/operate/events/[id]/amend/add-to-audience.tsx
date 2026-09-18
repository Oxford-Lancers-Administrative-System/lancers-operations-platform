"use client";

import { useActionState, useCallback, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ActionBar } from "@/components/action-bar";
import { EmptyState } from "@/components/empty-state";
import { CheckField, Field, SelectField } from "@/components/field";
import { Notice } from "@/components/notice";
import { Section } from "@/components/section";
import {
  audiencePeople,
  type AudienceCandidate,
  type AudienceCapacity,
  type AudiencePerson,
} from "@/lib/services/audience-selection";
import { addEventAudienceAction } from "../change-actions";
import { EMPTY_TRANSITION_STATE } from "../../form-state";
import { describeAudienceRow } from "../../presentation";

/**
 * LAN-393 — **Add to audience**, on the amend screen of an approved event.
 *
 * The draft builder's own list, with two differences and no third. It offers
 * only people who are not already on the event, filtered by *human* rather than
 * by selection key, because invariant P9 is one row per human per event and
 * somebody already on it as a committee member must not be offered again as a
 * player. And it only adds: removing is not in scope, so there is no way to
 * untick a name that is already on the event, because no such name is shown.
 */

export interface AddToAudienceProps {
  eventId: string;
  /** Only the people who can still be added — the server has already removed the rest. */
  candidates: AudienceCandidate[];
  counts: Record<AudienceCapacity, number>;
  /** How many people the event's audience already holds, shown as a value beside the count added. */
  alreadyOnEvent: number;
}

export function AddToAudience({ eventId, candidates, counts, alreadyOnEvent }: AddToAudienceProps) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [search, setSearch] = useState("");
  const [capacity, setCapacity] = useState<"all" | AudienceCapacity>("all");
  const [state, formAction, pending] = useActionState(
    addEventAudienceAction,
    EMPTY_TRANSITION_STATE,
  );

  const keys = useMemo(() => [...selected], [selected]);
  const roster = useMemo(() => audiencePeople(candidates), [candidates]);

  const isChosen = useCallback(
    (person: AudiencePerson) => person.keys.some((key) => selected.has(key)),
    [selected],
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return roster
      .filter((person) => {
        if (capacity !== "all" && !person.capacities.includes(capacity)) return false;
        if (needle === "") return true;
        return (
          person.displayName.toLowerCase().includes(needle) ||
          person.standings.some((standing) => standing.toLowerCase().includes(needle))
        );
      })
      .sort((a, b) => {
        const order = Number(isChosen(b)) - Number(isChosen(a));
        return order !== 0 ? order : a.displayName.localeCompare(b.displayName);
      });
  }, [roster, search, capacity, isChosen]);

  const chosenPeople = roster.filter((person) => isChosen(person)).length;

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

  return (
    <Section title="Add to audience" testId="add-to-audience">
      <Stack spacing={3}>
        <Stack direction="row" spacing={3}>
          <Box>
            <Typography variant="overline" color="text.secondary" component="p">
              Already invited
            </Typography>
            <Typography variant="h6" data-testid="already-on-event">
              {alreadyOnEvent}
            </Typography>
          </Box>
          <Box>
            <Typography variant="overline" color="text.secondary" component="p">
              Can be added
            </Typography>
            <Typography variant="h6" data-testid="addable-count">
              {roster.length}
            </Typography>
          </Box>
        </Stack>

        {roster.length === 0 ? (
          <EmptyState title="Everybody selectable is already invited." testId="nobody-to-add" />
        ) : (
          <>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <Field
                label="Search name or role"
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
            </Stack>

            {visible.length === 0 ? (
              <EmptyState
                title="Nobody matches those filters."
                searched={search || undefined}
                testId="no-addable-candidates"
              />
            ) : (
              <Stack
                component="ul"
                sx={{ listStyle: "none", p: 0, m: 0 }}
                data-testid="addable-list"
                spacing={0}
              >
                {visible.map((person) => (
                  <Box
                    component="li"
                    key={person.personId}
                    sx={{ borderBottom: 1, borderColor: "divider", py: 0.5 }}
                  >
                    <CheckField
                      name={`add-${person.personId}`}
                      checked={isChosen(person)}
                      onChange={() => toggle(person)}
                      inputLabel={`Add ${person.displayName} — ${describeAudienceRow(person)}`}
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
              <Notice severity="error" testId="add-audience-error">
                {state.error}
              </Notice>
            ) : null}

            <Box component="form" action={formAction}>
              <input type="hidden" name="eventId" value={eventId} />
              {keys.map((key) => (
                <input key={key} type="hidden" name="audienceKey" value={key} />
              ))}
              <ActionBar
                sticky={false}
                primary={
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={pending || chosenPeople === 0}
                    data-testid="add-to-audience-submit"
                  >
                    {pending ? "Adding…" : `Add ${chosenPeople} to audience`}
                  </Button>
                }
              />
            </Box>
          </>
        )}
      </Stack>
    </Section>
  );
}
