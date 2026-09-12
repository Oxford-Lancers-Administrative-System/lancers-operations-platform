"use client";

import { useActionState, useState, type ReactNode } from "react";
import { Notice } from "@/components/notice";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControlLabel from "@mui/material/FormControlLabel";
import Link from "@mui/material/Link";
import { Section } from "@/components/section";
import { ActionBar } from "@/components/action-bar";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import { Field, DateField } from "@/components/field";
import { dateFromScheduledOn } from "@/app/operate/events/date-time-controls";
import Typography from "@mui/material/Typography";
import { formatClubDay } from "@/lib/club-time";
import {
  assignRoleAction,
  endRoleAction,
  replaceRoleHolderAction,
  searchCandidatesAction,
} from "../../actions";
import { EMPTY_ADMIN_ACTION_STATE, type AdminActionState } from "../../action-state";
import { candidateCaption } from "../../candidate-caption";
import {
  Outcome as AdminOutcome,
  OutcomeSlotProvider,
  useOutcomeSlot,
} from "@/components/outcome-slot";
import type { PermittedRoleActions } from "../../permissions";

// Changing who holds one seat — LAN-133. Three actions (Replace role, End
// role, assign into a vacancy) because DEC-account-state-separation makes
// them three different facts, not one form with an optional successor.
/** One current holder, with the two dates the forms below have to respect. */
export interface RoleActionHolder {
  readonly roleAssignmentId: string;
  readonly displayName: string;
  readonly effectiveFrom: string;
  /** The earliest date this assignment may be given as its end, `YYYY-MM-DD` (`earliestEndFor()`). */
  readonly earliestEnd: string;
}

export default function RoleActions({
  roleId,
  roleCode,
  roleLabel,
  vacant,
  assignable,
  admitsMultipleHolders,
  today,
  holders,
  permitted,
}: {
  roleId: string;
  roleCode: string;
  roleLabel: string;
  vacant: boolean;
  /** Whether the cycle this seat hangs off can take a new assignment today. */
  assignable: boolean;
  /** `DEC-assignment-dates-and-cardinality`. */
  admitsMultipleHolders: boolean;
  /** The club's own day, `YYYY-MM-DD`, as the page read it. */
  today: string;
  /** The current holders, for Replace and End. Empty when the seat is vacant. */
  holders: readonly RoleActionHolder[];
  permitted: PermittedRoleActions;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (panel: string) => setOpen((current) => (current === panel ? null : panel));

  const offered = {
    assign: permitted.assign && assignable && (vacant || admitsMultipleHolders),
    // Replacement hands one assignment over, offered only when exactly one
    // exists to hand over.
    replace: assignable && holders.length === 1 && permitted.replace,
    end: holders.length > 0 && permitted.end,
  };

  if (!offered.assign && !offered.replace && !offered.end) {
    return (
      <Typography variant="body2" color="text.secondary" data-testid="no-role-actions">
        {assignable
          ? "There is nothing you can change about who holds this role."
          : "There is no operating year running for this role, so nobody can be assigned to it " +
            "yet. Opening the year is not done here."}
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
            today={today}
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
            today={today}
            // Same floor as End — LAN-141 #2.
            earliestFrom={holders[0]?.earliestEnd}
          >
            <input type="hidden" name="roleId" value={roleId} />
          </PersonPanel>
        ) : null}

        {open === "end" ? <EndPanel roleId={roleId} holders={holders} today={today} /> : null}
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
  today,
  earliestFrom,
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
  successorOf?: readonly RoleActionHolder[];
  /** The club's own day, `YYYY-MM-DD`. */
  today: string;
  /** The earliest start this form may offer, `YYYY-MM-DD` — absent for an assignment into a vacancy. */
  earliestFrom?: string;
  children?: ReactNode;
}) {
  const [search, searchAction, searching] = useActionState(
    searchCandidatesAction,
    EMPTY_ADMIN_ACTION_STATE,
  );
  const [result, submitAction, submitting] = useActionState(action, EMPTY_ADMIN_ACTION_STATE);
  const [chosen, setChosen] = useState("");
  // Two slots on one panel, not one — LAN-141 #15.
  const searchSlot = useOutcomeSlot(`${testId}-search`);
  const slot = useOutcomeSlot(testId);

  // Search terms held here, not in the DOM — LAN133-BRIAN-7 (a submit form's
  // reset would otherwise empty them).
  const [terms, setTerms] = useState({ givenName: "", familyName: "", email: "" });
  const term = (field: keyof typeof terms) => ({
    value: terms[field],
    onChange: (event: { target: { value: string } }) =>
      setTerms((current) => ({ ...current, [field]: event.target.value })),
  });

  // LAN133-BRIAN-8: the empty-result alert carries the invite route.
  const todayIsAllowed = earliestFrom === undefined || earliestFrom <= today;

  /** What the administrator asked for, so an empty answer can name it. */
  const typed = [terms.givenName, terms.familyName, terms.email]
    .map((value) => value.trim())
    .filter((value) => value !== "");
  const searchedFor = typed.length > 0 ? typed.join(" ") : "those details";

  return (
    <Box data-testid={testId}>
      <Section title={title} description={explanation}>
        <Box component="form" action={searchAction} onSubmit={searchSlot.claim}>
          <Stack spacing={2}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Find the person
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <Field name="givenName" label="First name" {...term("givenName")} />
              <Field name="familyName" label="Last name" {...term("familyName")} />
            </Stack>
            <Field name="email" type="email" label="Email" {...term("email")} />
            <Box>
              <Button type="submit" disabled={searching} sx={{ minHeight: 44 }}>
                Search
              </Button>
            </Box>
          </Stack>
        </Box>

        <AdminOutcome state={{ ...search, notice: null }} showing={searchSlot.showing} />

        {search.candidates ? (
          search.candidates.length === 0 ? (
            <Notice severity="info" testId="no-candidates">
              <Typography variant="body2" sx={{ mb: 1 }}>
                Nobody in the club&rsquo;s records matches {searchedFor} exactly. The search matches
                whole names and whole addresses, so a near miss finds nothing — check the spelling
                first.
              </Typography>
              <Typography variant="body2">
                If they are new to the club, they need a record before they can hold a seat.{" "}
                <Link href="/operate/admin/operators/new">Invite them as an operator</Link>, then
                come back to this role.
              </Typography>
            </Notice>
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
                          {/* The same search feeds the invitation door, and
                              both are the operator deciding whether this is
                              the same human — so both read the same caption. */}
                          {candidateCaption(
                            candidate,
                            candidate.operatorState
                              ? `Operator account: ${candidate.operatorState}`
                              : "No operator account",
                          )}
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
              <input
                type="hidden"
                name="roleAssignmentId"
                value={successorOf[0].roleAssignmentId}
              />
            ) : null}
            <RoleDateField
              name="effectiveFrom"
              label="Effective from"
              required={!todayIsAllowed}
              defaultValue={todayIsAllowed ? "" : earliestFrom}
              minDay={earliestFrom}
              helperText={
                todayIsAllowed
                  ? "Leave blank for today."
                  : `The holder this replaces started today, and an assignment cannot end on the ` +
                    `day it started. The earliest handover is ${formatClubDay(earliestFrom ?? "")}.`
              }
            />
            <Field
              name="reason"
              label={reasonRequired ? "Reason" : "Reason (optional)"}
              required={reasonRequired}
              helperText={reasonHelp}
              multiline
              minRows={2}
            />
            <Box>
              <ActionBar
                primary={
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={submitting || chosen === ""}
                    sx={{ minHeight: 44 }}
                  >
                    {submitLabel}
                  </Button>
                }
              />
              {chosen === "" ? (
                // LAN133-BRIAN-8: the disabled control names what would enable it.
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
      </Section>
    </Box>
  );
}

/** Ending a seat: the one action that produces a Not assigned vacancy. */
function EndPanel({
  roleId,
  holders,
  today,
}: {
  roleId: string;
  holders: readonly RoleActionHolder[];
  today: string;
}) {
  const [state, formAction, pending] = useActionState(endRoleAction, EMPTY_ADMIN_ACTION_STATE);
  const [assignment, setAssignment] = useState(holders[0]?.roleAssignmentId ?? "");
  const slot = useOutcomeSlot("end-panel");

  // The earliest end the chosen assignment can be given — LAN-141 #2.
  const chosen = holders.find((holder) => holder.roleAssignmentId === assignment) ?? holders[0];
  const earliestEnd = chosen?.earliestEnd;
  const todayIsAllowed = earliestEnd === undefined || earliestEnd <= today;

  return (
    <Box data-testid="end-panel">
      <Section title="End role">
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Use this when the role ends with no immediate successor. The seat becomes Not assigned,
          the assignment stays in the club&rsquo;s history, and the person&rsquo;s operator account
          is untouched.
        </Typography>

        <Box component="form" action={formAction} onSubmit={slot.claim}>
          <Stack spacing={2}>
            <input type="hidden" name="roleId" value={roleId} />
            {holders.length > 1 ? (
              <RadioGroup
                value={assignment}
                onChange={(event) => setAssignment(event.target.value)}
              >
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
            <RoleDateField
              name="effectiveTo"
              label="Ends on"
              required={!todayIsAllowed}
              defaultValue={todayIsAllowed ? "" : earliestEnd}
              key={earliestEnd ?? "none"}
              minDay={earliestEnd}
              helperText={
                todayIsAllowed
                  ? "Leave blank to end it today. A future date schedules it."
                  : `This assignment started today, and an assignment cannot end on the day it ` +
                    `started. The earliest it can end is ${formatClubDay(earliestEnd ?? "")}, ` +
                    `which schedules it.`
              }
            />
            <Field name="reason" label="Reason" required multiline minRows={2} />
            <ActionBar
              primary={
                <Button type="submit" variant="contained" disabled={pending}>
                  End role
                </Button>
              }
            />
          </Stack>
        </Box>

        <AdminOutcome state={state} showing={slot.showing} />
      </Section>
    </Box>
  );
}

/** Own the picker value while the containing action panel owns its lifetime. */
function RoleDateField({
  name,
  label,
  defaultValue = "",
  minDay,
  required,
  helperText,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  minDay?: string;
  required: boolean;
  helperText: string;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <DateField
      name={name}
      label={label}
      value={value}
      onChange={setValue}
      minDate={minDay ? (dateFromScheduledOn(minDay) ?? undefined) : undefined}
      required={required}
      helperText={helperText}
    />
  );
}
