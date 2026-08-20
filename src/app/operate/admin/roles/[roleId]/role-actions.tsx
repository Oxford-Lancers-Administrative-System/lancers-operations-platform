"use client";

import { useActionState, useState, type ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControlLabel from "@mui/material/FormControlLabel";
import Link from "@mui/material/Link";
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
import AdminOutcome, { OutcomeSlotProvider, useOutcomeSlot } from "../../outcome";
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
    <OutcomeSlotProvider>
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
    </OutcomeSlotProvider>
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
  const slot = useOutcomeSlot(testId);

  /**
   * The search terms, held here rather than in the DOM — LAN133-BRIAN-7.
   *
   * React resets a form after its action runs, which is right for a form that
   * *submits* something and wrong for one that *asks* something: pressing
   * Search emptied the three fields the administrator had just typed, so the
   * result appeared beneath a blank form with no way to tell what had been
   * searched for, and refining a near miss meant retyping all of it.
   *
   * Controlled inputs survive that reset, because their value comes from state
   * the reset does not touch. It also makes the terms available to the empty
   * result below, which can then say what it looked for.
   */
  const [terms, setTerms] = useState({ givenName: "", familyName: "", email: "" });
  const term = (field: keyof typeof terms) => ({
    value: terms[field],
    onChange: (event: { target: { value: string } }) =>
      setTerms((current) => ({ ...current, [field]: event.target.value })),
  });

  /**
   * LAN133-BRIAN-8, below. The constraint an empty result expresses is real — a
   * seat goes to somebody the club already holds a record for — but stating a
   * rule is not the same as showing the way out. It told the administrator to
   * invite the person first, then left them on a screen with no link to do it
   * and a submit button that could never enable, which reads as a broken page
   * rather than as a rule. The alert now carries the route, and the disabled
   * button says what would enable it.
   */

  /** What the administrator asked for, so an empty answer can name it. */
  const typed = [terms.givenName, terms.familyName, terms.email]
    .map((value) => value.trim())
    .filter((value) => value !== "");
  const searchedFor = typed.length > 0 ? typed.join(" ") : "those details";

  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-testid={testId}>
      <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {explanation}
      </Typography>

      <Box component="form" action={searchAction} onSubmit={slot.claim}>
        <Stack spacing={2}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Find the person
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField name="givenName" label="First name" fullWidth {...term("givenName")} />
            <TextField name="familyName" label="Last name" fullWidth {...term("familyName")} />
          </Stack>
          <TextField name="email" type="email" label="Email" fullWidth {...term("email")} />
          <Box>
            <Button type="submit" disabled={searching} sx={{ minHeight: 44 }}>
              Search
            </Button>
          </Box>
        </Stack>
      </Box>

      <AdminOutcome state={{ ...search, notice: null, candidates: null }} />

      {search.candidates ? (
        search.candidates.length === 0 ? (
          <Alert severity="info" sx={{ mt: 2 }} data-testid="no-candidates">
            <Typography variant="body2" sx={{ mb: 1 }}>
              Nobody in the club&rsquo;s records matches {searchedFor} exactly. The search matches
              whole names and whole addresses, so a near miss finds nothing — check the spelling
              first.
            </Typography>
            <Typography variant="body2">
              If they are new to the club, they need a record before they can hold a seat.{" "}
              <Link href="/operate/admin/operators/new">Invite them as an operator</Link>, then come
              back to this role.
            </Typography>
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

      <Box component="form" action={submitAction} sx={{ mt: 2 }} onSubmit={slot.claim}>
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
            {chosen === "" ? (
              // A disabled control that does not say what would enable it is a
              // dead end — LAN133-BRIAN-8. This is the one sentence that turns
              // it back into a step.
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mt: 1 }}
                data-testid="choose-somebody-first"
              >
                {search.candidates && search.candidates.length > 0
                  ? "Choose the person above to enable this."
                  : "Find the person above and choose them to enable this."}
              </Typography>
            ) : null}
          </Box>
        </Stack>
      </Box>

      <AdminOutcome state={result} showing={slot.showing} />
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
  const slot = useOutcomeSlot("end-panel");

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

      <Box component="form" action={formAction} onSubmit={slot.claim}>
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

      <AdminOutcome state={state} showing={slot.showing} />
    </Paper>
  );
}
