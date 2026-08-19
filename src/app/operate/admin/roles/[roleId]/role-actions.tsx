"use client";

import { useActionState, useState, type ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControlLabel from "@mui/material/FormControlLabel";
import Paper from "@mui/material/Paper";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  assignRoleAction,
  endRoleAction,
  replaceRoleHolderAction,
  searchCandidatesAction,
} from "../../actions";
import { EMPTY_ADMIN_ACTION_STATE, type AdminActionState } from "../../action-state";
import type { PermittedRoleActions } from "../../permissions";

/**
 * Changing who holds one seat — LAN-133.
 *
 * Three actions, named by `DEC-administration-language-and-states`: **Replace
 * role**, **End role**, and the assignment into a vacancy. They are three
 * because `DEC-account-state-separation` makes them three different facts —
 * "Replace role ends the outgoing assignment and creates the successor … only
 * End role creates a Not assigned vacancy" — and a single "change holder" form
 * with an optional successor would have collapsed that distinction into a
 * checkbox.
 *
 * Nothing here edits the role or what it can do. `DEC-no-runtime-role-editing`
 * puts the catalogue and the capability map beyond the application, and this
 * component has no field that could reach either.
 *
 * ## Choosing a person is a search, not a list
 *
 * `findOperatorCandidates` matches **exactly** — a whole given name, a whole
 * family name, a whole address, the last nine digits of a phone. That is its
 * rule and not this screen's, and the reason it is not a dropdown of everybody:
 * a picker listing the club's members would disclose the roster to anybody who
 * opened a role, and a loose search would do the same one letter at a time.
 *
 * So the administrator types who they mean, and gets the people who are
 * certainly that person. An empty result is a real answer — the successor has
 * to exist as a Person before they can be given a seat, and the invitation flow
 * is where a new one is created.
 */
export default function RoleActions({
  roleId,
  roleCode,
  roleLabel,
  vacant,
  admitsMultipleHolders,
  holders,
  permitted,
}: {
  roleId: string;
  roleCode: string;
  roleLabel: string;
  vacant: boolean;
  /**
   * `DEC-assignment-dates-and-cardinality`: "Single-holder restrictions follow
   * the constitution, with General Manager additionally single-holder; other
   * roles permit multiple holders unless another authoritative rule says
   * otherwise." A seat that admits several can be assigned again while it is
   * held — two Social Secretaries is in the club's own 2025 AGM record — and
   * one that does not cannot, which is why Assign is not simply "when vacant".
   */
  admitsMultipleHolders: boolean;
  /** The current holders, for Replace and End. Empty when the seat is vacant. */
  holders: readonly { roleAssignmentId: string; displayName: string }[];
  permitted: PermittedRoleActions;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (panel: string) => setOpen((current) => (current === panel ? null : panel));

  const offered = {
    assign: permitted.assign && (vacant || admitsMultipleHolders),
    // Replacement hands **one** assignment over, so it is offered only when
    // there is exactly one to hand over. On a seat with several holders the
    // question "who is being replaced?" has no single answer, and End plus
    // Assign say the same thing without guessing.
    replace: holders.length === 1 && permitted.replace,
    end: holders.length > 0 && permitted.end,
  };

  if (!offered.assign && !offered.replace && !offered.end) {
    return (
      <Typography variant="body2" color="text.secondary" data-testid="no-role-actions">
        There is nothing you can change about who holds this role.
      </Typography>
    );
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
        {offered.assign ? (
          <Button variant="contained" onClick={() => toggle("assign")} sx={{ minHeight: 44 }}>
            Assign role
          </Button>
        ) : null}
        {offered.replace ? (
          <Button variant="contained" onClick={() => toggle("replace")} sx={{ minHeight: 44 }}>
            Replace role
          </Button>
        ) : null}
        {offered.end ? (
          <Button onClick={() => toggle("end")} sx={{ minHeight: 44 }}>
            End role
          </Button>
        ) : null}
      </Stack>

      {open === "assign" ? (
        <PersonPanel
          title={`Assign ${roleLabel}`}
          explanation="The start date is today unless you say otherwise. A future date is fine; a date in the past is backdating and has to say why."
          action={assignRoleAction}
          submitLabel="Assign role"
          testId="assign-panel"
          reasonRequired={false}
          reasonHelp="Required only when the start date is before today."
        >
          <input type="hidden" name="roleId" value={roleId} />
          <input type="hidden" name="roleCode" value={roleCode} />
        </PersonPanel>
      ) : null}

      {open === "replace" ? (
        <PersonPanel
          title={`Replace ${roleLabel}`}
          explanation="The outgoing assignment ends and the successor's begins. Both stay in the club's history, and neither is rewritten."
          action={replaceRoleHolderAction}
          submitLabel="Replace role"
          testId="replace-panel"
          reasonRequired
          personField="successorPersonId"
          successorOf={holders}
        >
          <input type="hidden" name="roleId" value={roleId} />
        </PersonPanel>
      ) : null}

      {open === "end" ? <EndPanel roleId={roleId} holders={holders} /> : null}
    </Stack>
  );
}

/** Assign and Replace: find a person, then say when and why. */
function PersonPanel({
  title,
  explanation,
  action,
  submitLabel,
  testId,
  reasonRequired,
  reasonHelp,
  personField = "personId",
  successorOf,
  children,
}: {
  title: string;
  explanation: string;
  action: (previous: AdminActionState, formData: FormData) => Promise<AdminActionState>;
  submitLabel: string;
  testId: string;
  reasonRequired: boolean;
  reasonHelp?: string;
  personField?: string;
  /** Present for a replacement: which assignment is being handed over. */
  successorOf?: readonly { roleAssignmentId: string; displayName: string }[];
  children?: ReactNode;
}) {
  const [search, searchAction, searching] = useActionState(
    searchCandidatesAction,
    EMPTY_ADMIN_ACTION_STATE,
  );
  const [result, submitAction, submitting] = useActionState(action, EMPTY_ADMIN_ACTION_STATE);
  const [chosen, setChosen] = useState("");

  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-testid={testId}>
      <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {explanation}
      </Typography>

      <Box component="form" action={searchAction}>
        <Stack spacing={2}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Find the person
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField name="givenName" label="First name" fullWidth />
            <TextField name="familyName" label="Last name" fullWidth />
          </Stack>
          <TextField name="email" type="email" label="Email" fullWidth />
          <Box>
            <Button type="submit" disabled={searching} sx={{ minHeight: 44 }}>
              Search
            </Button>
          </Box>
        </Stack>
      </Box>

      {search.error ? (
        <Alert severity="error" sx={{ mt: 2 }}>
          {search.error}
        </Alert>
      ) : null}

      {search.candidates ? (
        search.candidates.length === 0 ? (
          <Alert severity="info" sx={{ mt: 2 }} data-testid="no-candidates">
            Nobody in the club&rsquo;s records matches exactly. Check the spelling, or invite them
            as an operator first if they are new.
          </Alert>
        ) : (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
              Choose the person
            </Typography>
            <RadioGroup value={chosen} onChange={(event) => setChosen(event.target.value)}>
              {search.candidates.map((candidate) => (
                <FormControlLabel
                  key={candidate.personId}
                  value={candidate.personId}
                  control={<Radio />}
                  data-testid="candidate-choice"
                  label={
                    <Box>
                      <Typography variant="body2">{candidate.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {[
                          candidate.email,
                          candidate.operatorState
                            ? `Operator account: ${candidate.operatorState}`
                            : "No operator account",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </Typography>
                    </Box>
                  }
                />
              ))}
            </RadioGroup>
          </Box>
        )
      ) : null}

      <Box component="form" action={submitAction} sx={{ mt: 2 }}>
        <Stack spacing={2}>
          {children}
          <input type="hidden" name={personField} value={chosen} />
          {successorOf && successorOf.length > 0 ? (
            <input type="hidden" name="roleAssignmentId" value={successorOf[0].roleAssignmentId} />
          ) : null}
          <TextField
            name="effectiveFrom"
            type="date"
            label="Effective from"
            slotProps={{ inputLabel: { shrink: true } }}
            helperText="Leave blank for today."
            fullWidth
          />
          <TextField
            name="reason"
            label={reasonRequired ? "Reason" : "Reason (optional)"}
            required={reasonRequired}
            helperText={reasonHelp}
            multiline
            minRows={2}
            fullWidth
          />
          <Box>
            <Button
              type="submit"
              variant="contained"
              disabled={submitting || chosen === ""}
              sx={{ minHeight: 44 }}
            >
              {submitLabel}
            </Button>
          </Box>
        </Stack>
      </Box>

      <Outcome state={result} />
    </Paper>
  );
}

/** Ending a seat: the one action that produces a Not assigned vacancy. */
function EndPanel({
  roleId,
  holders,
}: {
  roleId: string;
  holders: readonly { roleAssignmentId: string; displayName: string }[];
}) {
  const [state, formAction, pending] = useActionState(endRoleAction, EMPTY_ADMIN_ACTION_STATE);
  const [assignment, setAssignment] = useState(holders[0]?.roleAssignmentId ?? "");

  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-testid="end-panel">
      <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 700 }}>
        End role
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Use this when the role ends with no immediate successor. The seat becomes Not assigned, the
        assignment stays in the club&rsquo;s history, and the person&rsquo;s operator account is
        untouched.
      </Typography>

      <Box component="form" action={formAction}>
        <Stack spacing={2}>
          <input type="hidden" name="roleId" value={roleId} />
          {holders.length > 1 ? (
            <RadioGroup value={assignment} onChange={(event) => setAssignment(event.target.value)}>
              {holders.map((holder) => (
                <FormControlLabel
                  key={holder.roleAssignmentId}
                  value={holder.roleAssignmentId}
                  control={<Radio />}
                  label={holder.displayName}
                />
              ))}
            </RadioGroup>
          ) : (
            <Typography variant="body2">{holders[0]?.displayName}</Typography>
          )}
          <input type="hidden" name="roleAssignmentId" value={assignment} />
          <TextField
            name="effectiveTo"
            type="date"
            label="Ends on"
            slotProps={{ inputLabel: { shrink: true } }}
            helperText="Leave blank to end it today. A future date schedules it."
            fullWidth
          />
          <TextField name="reason" label="Reason" required multiline minRows={2} fullWidth />
          <Box>
            <Button type="submit" variant="contained" disabled={pending} sx={{ minHeight: 44 }}>
              End role
            </Button>
          </Box>
        </Stack>
      </Box>

      <Outcome state={state} />
    </Paper>
  );
}

function Outcome({ state }: { state: AdminActionState }) {
  if (state.error) {
    return (
      <Alert severity="error" sx={{ mt: 2 }}>
        {state.error}
      </Alert>
    );
  }
  if (state.notice) {
    return (
      <Alert severity="success" sx={{ mt: 2 }}>
        {state.notice}
      </Alert>
    );
  }
  return null;
}
