"use client";

import { useActionState, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  AUDIENCE_GROUPS,
  groupIsSelected,
  groupSelectionKeys,
  groupSize,
  resolveSelection,
  type AudienceCandidate,
  type AudienceCapacity,
} from "@/lib/services/audience-selection";
import { saveEventAudienceAction } from "../actions";
import { EMPTY_TRANSITION_STATE } from "../form-state";
import {
  AUDIENCE_BUILDER_DETAIL,
  AUDIENCE_BUILDER_HEADLINE,
  CAPACITY_LABELS,
  labelFor,
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
 * ## Selection starts from what is saved, and otherwise from nothing
 *
 * `initialKeys` is the audience already stored on the draft. On a draft that has
 * none it is empty — and *that* is ADR 0012's rule, which is about the system
 * never implying an audience. Restoring the operator's own saved work is not an
 * implied audience; it is the same audience they are coming back to. There is
 * still no default group, no whole-roster fallback, and no "if none selected
 * then everyone" anywhere below.
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
  candidates: AudienceCandidate[];
  counts: Record<AudienceCapacity, number>;
  /** The audience already saved against this draft. Empty when there is none. */
  initialKeys: string[];
}

const UNITS = ["Both", "Offence", "Defence", "Special teams"] as const;

export function AudienceBuilder({
  eventId,
  candidates,
  counts,
  initialKeys,
}: AudienceBuilderProps) {
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

  function toggleGroup(groupKey: string) {
    const groupKeys = groupSelectionKeys(candidates, groupKey);
    const alreadyIn = groupIsSelected(candidates, groupKey, selected);
    setSelected((current) => {
      const next = new Set(current);
      for (const key of groupKeys) {
        if (alreadyIn) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  }

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }} data-testid="audience-builder">
      <Stack spacing={3}>
        <Box>
          <Typography variant="h6" component="h2">
            {AUDIENCE_BUILDER_HEADLINE}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {AUDIENCE_BUILDER_DETAIL}
          </Typography>
        </Box>

        <Box>
          <Typography variant="overline" color="text.secondary" component="p">
            Add a group
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
            {AUDIENCE_GROUPS.map((group) => {
              const size = groupSize(candidates, group.key);
              const on = groupIsSelected(candidates, group.key, selected);
              return (
                <Button
                  key={group.key}
                  variant={on ? "contained" : "outlined"}
                  size="small"
                  disabled={size === 0}
                  aria-pressed={on}
                  onClick={() => toggleGroup(group.key)}
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
          <TextField
            label="Search name, role or contact"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            size="small"
            fullWidth
          />
          <TextField
            select
            label="Capacity"
            value={capacity}
            onChange={(event) => setCapacity(event.target.value as "all" | AudienceCapacity)}
            size="small"
            sx={{ minWidth: { sm: 160 } }}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="player">{`Players (${counts.player})`}</MenuItem>
            <MenuItem value="coach">{`Coaches (${counts.coach})`}</MenuItem>
            <MenuItem value="committee">{`Committee (${counts.committee})`}</MenuItem>
          </TextField>
          <TextField
            select
            label="Unit"
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            size="small"
            sx={{ minWidth: { sm: 160 } }}
          >
            <MenuItem value="all">All</MenuItem>
            {UNITS.map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        <Divider />

        {visible.length === 0 ? (
          <Alert severity="info" data-testid="no-candidates">
            Nobody matches those filters. Clear them to see everyone who can be invited.
          </Alert>
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
                <FormControlLabel
                  sx={{ width: "100%", m: 0, alignItems: "flex-start" }}
                  control={
                    <Checkbox
                      checked={selected.has(candidate.key)}
                      onChange={() => toggle(candidate.key)}
                      slotProps={{
                        input: {
                          "aria-label": `Include ${candidate.displayName} as ${labelFor(
                            CAPACITY_LABELS,
                            candidate.capacity,
                          )}`,
                        },
                      }}
                    />
                  }
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
          <Alert severity="error" data-testid="audience-save-error">
            {state.error}
          </Alert>
        ) : null}

        <Box component="form" action={formAction}>
          <input type="hidden" name="eventId" value={eventId} />
          {keys.map((key) => (
            <input key={key} type="hidden" name="audienceKey" value={key} />
          ))}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Button
              type="submit"
              variant="contained"
              disabled={pending}
              data-testid="review-selection"
              sx={{ minHeight: 44 }}
            >
              {pending ? "Saving…" : `Review ${people} selected`}
            </Button>
            <Button
              variant="outlined"
              href={`/operate/events/${eventId}`}
              disabled={pending}
              sx={{ minHeight: 44 }}
            >
              Cancel
            </Button>
          </Stack>
        </Box>
      </Stack>
    </Paper>
  );
}
