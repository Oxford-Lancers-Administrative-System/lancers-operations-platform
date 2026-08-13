"use client";

import { useActionState, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  AUDIENCE_GROUPS,
  groupSelectionKeys,
  resolveSelection,
  type AudienceCandidate,
  type AudienceCapacity,
} from "@/lib/services/audience-selection";
import { approveEventAction } from "../actions";
import { EMPTY_TRANSITION_STATE } from "../form-state";
import {
  APPROVAL_DETAIL,
  APPROVAL_HEADLINE_PREFIX,
  AUDIENCE_BUILDER_DETAIL,
  AUDIENCE_BUILDER_HEADLINE,
  CAPACITY_LABELS,
  DEADLINE_DUE_IMMEDIATELY,
  DEADLINE_DUE_IMMEDIATELY_DETAIL,
  DEADLINE_NONE,
  DEADLINE_NONE_DETAIL,
  DISTRIBUTION_AUTOMATED,
  DISTRIBUTION_BEGINS_AFTER_APPROVAL,
  EMPTY_AUDIENCE_DETAIL,
  EMPTY_AUDIENCE_HEADLINE,
  EMPTY_AUDIENCE_SERVER_NOTE,
  labelFor,
} from "../presentation";

/**
 * UX-40, UX-41 and UX-42 — building an audience, confirming it, and being
 * refused an empty one.
 *
 * ## Why the three screens are one component
 *
 * The screen registry gives all three the same route, `/operate/events/[id]`,
 * and that is not an oversight in the contract: they are three states of one
 * decision, and the thing that moves between them — the selection — must never
 * be written down until the last of them is confirmed. Nothing here persists
 * anything. The audience exists only in this component's state until the
 * approver presses **Approve event**, which is what makes "a rejected approval
 * attempt leaves the event as `draft`" true by construction rather than by
 * cleanup.
 *
 * It is the same device LAN-76 used for UX-33, and for the same reason.
 *
 * ## The selection starts empty, and the code says so once
 *
 * `useState(new Set())`. There is no initialiser reading a group, no effect that
 * fills it in, and no "if nothing is selected, assume everyone" anywhere below.
 * The group buttons are the only thing that adds in bulk and each is an explicit
 * press. This is ADR 0012's rule and Brian's clarification, in the one place a
 * future edit would be tempted to break it.
 *
 * ## Why the review list is computed here rather than sent from the server
 *
 * Because it has to be the *same* list. `resolveSelection` is the pure function
 * the approval transaction also runs, so the names and the count on the
 * confirmation screen are produced by the code that will write the rows — not by
 * a second implementation that agrees with it until the day somebody is both a
 * player and a coach. See `src/lib/services/audience-selection.ts`.
 *
 * The server re-resolves regardless, against a catalogue it reads inside the
 * transaction. This is a display, never the authority.
 */

export interface ApprovalWorkflowProps {
  eventId: string;
  eventName: string;
  /** "Sunday, 18 October 2026 · 10:00–13:00". */
  eventWhen: string;
  /** "Practice · University Parks". */
  eventFacts: string;
  /** "Mandatory · responses solicited". */
  eventExpectation: string;
  candidates: AudienceCandidate[];
  counts: Record<AudienceCapacity, number>;
  /** `null` where the event solicits no response — invariant E6. */
  deadline: { label: string; clamped: boolean } | null;
}

type Phase = "closed" | "build" | "review" | "empty";

const UNITS = ["Both", "Offence", "Defence", "Special teams"] as const;

export function ApprovalWorkflow(props: ApprovalWorkflowProps) {
  const { eventId, eventName, eventWhen, eventFacts, eventExpectation, candidates, deadline } =
    props;

  const [phase, setPhase] = useState<Phase>("closed");
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [search, setSearch] = useState("");
  const [capacity, setCapacity] = useState<"all" | AudienceCapacity>("all");
  const [unit, setUnit] = useState<string>("all");

  const [state, formAction, pending] = useActionState(approveEventAction, EMPTY_TRANSITION_STATE);

  const keys = useMemo(() => [...selected], [selected]);

  /** Exactly what approval will write, by the transaction's own rules. */
  const resolution = useMemo(() => resolveSelection(candidates, keys), [candidates, keys]);
  const members = resolution.ok ? resolution.members : [];

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return candidates.filter((candidate) => {
      if (capacity !== "all" && candidate.capacity !== capacity) return false;
      if (unit !== "all" && candidate.unit !== unit) return false;
      if (needle === "") return true;
      return (
        candidate.displayName.toLowerCase().includes(needle) ||
        candidate.standing.toLowerCase().includes(needle) ||
        (candidate.contact ?? "").toLowerCase().includes(needle)
      );
    });
  }, [candidates, search, capacity, unit]);

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  function addGroup(groupKey: string) {
    const additions = groupSelectionKeys(candidates, groupKey);
    setSelected((current) => new Set([...current, ...additions]));
  }

  if (phase === "closed") {
    return (
      <Stack spacing={1} data-testid="approval-entry">
        <Button variant="contained" onClick={() => setPhase("build")} fullWidth>
          Choose audience and approve
        </Button>
        <Typography variant="body2" color="text.secondary">
          Nothing is sent until you have chosen who this event is for and approved it.
        </Typography>
      </Stack>
    );
  }

  if (phase === "empty") {
    return (
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }} data-testid="empty-audience-refusal">
        <Stack spacing={2}>
          <Typography variant="h6" component="h2">
            {EMPTY_AUDIENCE_HEADLINE}
          </Typography>
          <Alert severity="warning">{EMPTY_AUDIENCE_DETAIL}</Alert>
          <Typography variant="body2" color="text.secondary">
            {EMPTY_AUDIENCE_SERVER_NOTE}
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Button variant="contained" onClick={() => setPhase("build")}>
              Build audience
            </Button>
            <Button variant="outlined" onClick={() => setPhase("closed")}>
              Return to event
            </Button>
          </Stack>
        </Stack>
      </Paper>
    );
  }

  if (phase === "review") {
    return (
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }} data-testid="approval-review">
        <Stack spacing={3}>
          <Box>
            <Typography variant="h6" component="h2">
              {`${APPROVAL_HEADLINE_PREFIX} ${eventName}`}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {eventWhen}
            </Typography>
          </Box>

          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(2, minmax(0, 160px))" },
            }}
          >
            <Metric
              value={String(members.length)}
              label="Confirmed audience"
              testId="audience-total"
            />
            <Metric value="0" label="Audience defects" testId="audience-defects" />
          </Box>

          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
            }}
          >
            <Fact label="Event" value={eventFacts} note={eventExpectation} />
            <Fact
              label="Audience"
              value={`${members.length} named ${members.length === 1 ? "invitee" : "invitees"}`}
              note="Explicitly resolved"
            />
            <Fact
              label="RSVP deadline"
              value={
                deadline
                  ? deadline.clamped
                    ? DEADLINE_DUE_IMMEDIATELY
                    : deadline.label
                  : DEADLINE_NONE
              }
              note={
                deadline
                  ? deadline.clamped
                    ? DEADLINE_DUE_IMMEDIATELY_DETAIL
                    : "Set from the club's rule for this kind of event"
                  : DEADLINE_NONE_DETAIL
              }
              testId="deadline-fact"
            />
            <Fact
              label="Distribution"
              value={DISTRIBUTION_AUTOMATED}
              note={DISTRIBUTION_BEGINS_AFTER_APPROVAL}
            />
          </Box>

          <Box>
            <Typography variant="overline" color="text.secondary" component="p">
              Who will be asked
            </Typography>
            <Stack
              component="ul"
              spacing={0}
              sx={{ listStyle: "none", p: 0, m: 0 }}
              data-testid="resolved-audience"
            >
              {members.map((member) => (
                <Box
                  component="li"
                  key={`${member.capacity}:${member.anchorId}`}
                  sx={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 1,
                    alignItems: "center",
                    justifyContent: "space-between",
                    py: 1,
                    borderBottom: 1,
                    borderColor: "divider",
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {member.displayName}
                  </Typography>
                  <Chip size="small" label={labelFor(CAPACITY_LABELS, member.capacity)} />
                </Box>
              ))}
            </Stack>
          </Box>

          <Typography variant="body2" color="text.secondary">
            {APPROVAL_DETAIL}
          </Typography>

          {state.error ? (
            <Alert severity="error" data-testid="approval-error">
              {state.error}
            </Alert>
          ) : null}

          <Box component="form" action={formAction}>
            <input type="hidden" name="eventId" value={eventId} />
            {keys.map((key) => (
              <input key={key} type="hidden" name="audienceKey" value={key} />
            ))}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <Button type="submit" variant="contained" disabled={pending}>
                {pending ? "Approving…" : "Approve event"}
              </Button>
              <Button variant="outlined" onClick={() => setPhase("build")} disabled={pending}>
                Back to audience
              </Button>
            </Stack>
          </Box>
        </Stack>
      </Paper>
    );
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
              const size = groupSelectionKeys(candidates, group.key).length;
              return (
                <Button
                  key={group.key}
                  variant="outlined"
                  size="small"
                  disabled={size === 0}
                  onClick={() => addGroup(group.key)}
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
            <MenuItem value="player">{`Players (${props.counts.player})`}</MenuItem>
            <MenuItem value="coach">{`Coaches (${props.counts.coach})`}</MenuItem>
            <MenuItem value="committee">{`Committee (${props.counts.committee})`}</MenuItem>
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

        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{ alignItems: { sm: "center" } }}
        >
          <Button
            variant="contained"
            onClick={() => setPhase(members.length === 0 ? "empty" : "review")}
            data-testid="review-selection"
          >
            {`Review ${members.length} selected`}
          </Button>
          <Button variant="text" onClick={() => setPhase("closed")}>
            Cancel
          </Button>
          {members.length !== selected.size ? (
            // The honest explanation for a count that does not match the number
            // of boxes ticked: somebody was selected twice, in two capacities,
            // and will receive one invitation.
            <Typography variant="body2" color="text.secondary" data-testid="dedupe-note">
              {`${selected.size} selections resolve to ${members.length} people — somebody holds more than one capacity and is invited once.`}
            </Typography>
          ) : null}
        </Stack>
      </Stack>
    </Paper>
  );
}

function Metric({ value, label, testId }: { value: string; label: string; testId?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-testid={testId}>
      <Typography variant="h5" component="p" sx={{ fontWeight: 700 }}>
        {value}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Paper>
  );
}

function Fact({
  label,
  value,
  note,
  testId,
}: {
  label: string;
  value: string;
  note?: string;
  testId?: string;
}) {
  return (
    <Box sx={{ minWidth: 0 }} data-testid={testId}>
      <Typography variant="overline" color="text.secondary" component="p">
        {label}
      </Typography>
      <Typography variant="body1" sx={{ fontWeight: 600 }}>
        {value}
      </Typography>
      {note ? (
        <Typography variant="body2" color="text.secondary">
          {note}
        </Typography>
      ) : null}
    </Box>
  );
}
