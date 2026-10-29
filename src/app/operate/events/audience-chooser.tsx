"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { EmptyState } from "@/components/empty-state";
import { CheckField, Field, SelectField } from "@/components/field";
import {
  audienceCategoriesForEventType,
  audienceGroupCounts,
  audiencePeople,
  resolveSelection,
  selectionAfterGroupPress,
  type AudienceCandidate,
  type AudienceCapacity,
  type AudiencePerson,
} from "@/lib/services/audience-selection";
import { AudiencePicker } from "./audience-picker";
import { describeAudienceRow } from "./presentation";

const UNITS = ["Both", "Offence", "Defence", "Special teams"] as const;

/** The chooser's state — the people's keys and the groups that were ticked — owned by the form that submits it. */
export function useAudienceChoice(
  initialKeys: readonly string[],
  initialGroups: readonly string[],
) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(initialKeys));
  // LAN-392 / LAN-414 round 2: which groups were *ticked*, remembered rather than inferred.
  const [pressedGroups, setPressedGroups] = useState<ReadonlySet<string>>(
    () => new Set(initialGroups),
  );
  return { selected, setSelected, pressedGroups, setPressedGroups };
}

export type AudienceChoiceState = ReturnType<typeof useAudienceChoice>;

/**
 * UX-40's choosing half — the group picker, the search and filters, and the
 * one-row-per-person tick list — shared by the event audience builder and,
 * since LAN-514, the Messages page. It owns no submission: the form around it
 * reads `choice` and posts it. `rowNote` adds a short marker to a person's row
 * (Messages marks who has no email).
 */
export function AudienceChooser({
  eventType,
  candidates,
  counts,
  choice,
  rowNote,
}: {
  eventType: string;
  candidates: readonly AudienceCandidate[];
  counts: Record<AudienceCapacity, number>;
  choice: AudienceChoiceState;
  rowNote?: (person: AudiencePerson) => ReactNode;
}) {
  const { selected, setSelected, pressedGroups, setPressedGroups } = choice;
  // LAN-414 — the catalogue by category, one read shared by every surface that chooses.
  const categories = audienceCategoriesForEventType(eventType);
  const [search, setSearch] = useState("");
  const [capacity, setCapacity] = useState<"all" | AudienceCapacity>("all");
  const [unit, setUnit] = useState<string>("all");

  const keys = useMemo(() => [...selected], [selected]);
  const resolution = useMemo(() => resolveSelection(candidates, keys), [candidates, keys]);
  const people = resolution.ok ? resolution.members.length : 0;

  // One service read per selection change — never a per-row computation in the render.
  const groupCounts = useMemo(
    () =>
      audienceGroupCounts(
        candidates,
        categories.flatMap((section) => section.options.map((option) => option.token)),
        selected,
      ),
    [candidates, categories, selected],
  );

  const roster = useMemo(() => audiencePeople(candidates), [candidates]);

  const isChosen = useCallback(
    (person: AudiencePerson) => person.keys.some((key) => selected.has(key)),
    [selected],
  );

  // Chosen people first, then everybody else, each alphabetically — Brian
  // asked for it (unreviewable otherwise).
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

  // Every key the human holds moves together (LAN-294).
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
    const turningOn = !pressedGroups.has(groupKey);
    setSelected((current) =>
      selectionAfterGroupPress(candidates, groupKey, pressedGroups, current),
    );
    setPressedGroups((current) => {
      const next = new Set(current);
      if (turningOn) next.add(groupKey);
      else next.delete(groupKey);
      return next;
    });
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="overline" color="text.secondary" component="p">
          Add a group
        </Typography>
        <AudiencePicker
          categories={categories}
          counts={groupCounts}
          selectedGroups={pressedGroups}
          onToggleGroup={pressGroup}
          people={people}
          onClear={() => {
            setSelected(new Set());
            setPressedGroups(new Set());
          }}
        />
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
                    {rowNote?.(person) ?? null}
                  </Box>
                }
              />
            </Box>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
