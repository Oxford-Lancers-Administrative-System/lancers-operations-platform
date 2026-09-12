"use client";

import { useActionState, useState } from "react";
import { Notice } from "@/components/notice";
import { Section } from "@/components/section";
import { ActionBar } from "@/components/action-bar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Stepper from "@mui/material/Stepper";
import { Field, DateField, NO_AUTOFILL } from "@/components/field";
import { PhoneField } from "@/components/phone-field";
import { validatePhoneNumber } from "@/lib/services/person-validation";
import Typography from "@mui/material/Typography";
import { inviteOperatorAction, searchCandidatesAction } from "../../actions";
import { EMPTY_ADMIN_ACTION_STATE } from "../../action-state";
import {
  Outcome as AdminOutcome,
  OutcomeSlotProvider,
  useOutcomeSlot,
} from "@/components/outcome-slot";

/** One assignable seat, as the page read it from the catalogue. */
export interface AssignableRole {
  readonly code: string;
  readonly label: string;
  readonly groupLabel: string;
}

/** The choice meaning "none of these people — create a new record". */
const CREATE_NEW = "";

/**
 * The guided invitation — `REQ-invite-existing-person`, LAN-133. Duplicate
 * check comes first (`DEC-minimal-person-creation`): the same four fields
 * feed both search and invitation, before creating a second Person for an
 * existing player. The operating year is inherited, never a field
 * (`DEC-active-operating-year`). Ends on the created operator's own record
 * (delivery result, resend, audit history) rather than a separate "Sent"
 * panel.
 */
export default function InviteOperatorForm({ roles }: { roles: readonly AssignableRole[] }) {
  return (
    <OutcomeSlotProvider>
      <InviteForm roles={roles} />
    </OutcomeSlotProvider>
  );
}

function InviteForm({ roles }: { roles: readonly AssignableRole[] }) {
  const [search, searchAction, searching] = useActionState(
    searchCandidatesAction,
    EMPTY_ADMIN_ACTION_STATE,
  );
  const [invite, inviteAction, sending] = useActionState(
    inviteOperatorAction,
    EMPTY_ADMIN_ACTION_STATE,
  );

  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [personId, setPersonId] = useState(CREATE_NEW);
  const [roleCode, setRoleCode] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const searchSlot = useOutcomeSlot("person-search");
  const inviteSlot = useOutcomeSlot("invite");

  // The same validator the service repeats — one rule, checked twice, never a
  // looser browser copy (`add-recruit-form.tsx` sets the pattern).
  const phoneValidation = phone.trim() === "" ? null : validatePhoneNumber(phone);
  const phoneFormatError =
    phoneValidation && !phoneValidation.valid ? phoneValidation.message : null;

  const chosen = search.candidates?.find((candidate) => candidate.personId === personId) ?? null;
  const step = roleCode === "" ? (search.candidates ? 1 : 0) : 2;

  return (
    <Stack spacing={3}>
      <Stepper activeStep={step} alternativeLabel sx={{ display: { xs: "none", sm: "flex" } }}>
        {["Person", "Role", "Send"].map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <Section title="Who is this?">
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Field
              label="First name"
              value={givenName}
              onChange={(event) => setGivenName(event.target.value)}
              autoComplete={NO_AUTOFILL}
              required
            />
            <Field
              label="Last name"
              value={familyName}
              onChange={(event) => setFamilyName(event.target.value)}
              autoComplete={NO_AUTOFILL}
              required
            />
          </Stack>
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete={NO_AUTOFILL}
            required
            helperText="The invitation goes here, and this becomes their sign-in address."
          />
          {/*
            LAN-332. The one phone control (LAN-211), not a free-text box: it
            posts canonical E.164 through its own hidden input, and the two
            forms below carry that same value on. It sits outside both, so its
            hidden input posts nothing and cannot collide with theirs.
          */}
          <PhoneField
            name="phoneControl"
            label="Phone (optional)"
            onValueChange={setPhone}
            error={Boolean(phoneFormatError)}
            helperText={phoneFormatError ?? undefined}
            testId="invite-phone-field"
          />

          <Box component="form" action={searchAction} onSubmit={searchSlot.claim}>
            <input type="hidden" name="givenName" value={givenName} />
            <input type="hidden" name="familyName" value={familyName} />
            <input type="hidden" name="email" value={email} />
            <input type="hidden" name="phone" value={phone} />
            <Button
              type="submit"
              disabled={searching || Boolean(phoneFormatError)}
              sx={{ minHeight: 44 }}
            >
              {searching ? "Checking…" : "Check for an existing person"}
            </Button>
          </Box>
        </Stack>

        <AdminOutcome state={{ ...search, notice: null }} showing={searchSlot.showing} />

        {search.candidates ? (
          search.candidates.length === 0 ? (
            <Notice severity="info" testId="no-existing-person">
              Nobody in the club&rsquo;s records matches. A new record will be created for them.
            </Notice>
          ) : (
            <Box sx={{ mt: 2 }} data-testid="existing-people">
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                These people might already be them
              </Typography>
              <RadioGroup value={personId} onChange={(event) => setPersonId(event.target.value)}>
                {search.candidates.map((candidate) => (
                  <FormControlLabel
                    key={candidate.personId}
                    value={candidate.personId}
                    control={<Radio />}
                    data-testid="existing-person"
                    label={
                      <Box>
                        <Typography variant="body2">{candidate.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {[
                            // LAN-306, rule 8: its own value beside the formal
                            // name, never spliced into it. A candidate can
                            // surface on it alone, so hiding it would leave
                            // "matched on known as" with nothing to read.
                            candidate.knownAs ? `Known as ${candidate.knownAs}` : null,
                            candidate.email,
                            candidate.operatorState
                              ? `Already has a sign-in: ${candidate.operatorState}`
                              : "No operator account",
                            candidate.matchedOn.length > 0
                              ? `matched on ${candidate.matchedOn.join(", ")}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </Typography>
                      </Box>
                    }
                  />
                ))}
                <FormControlLabel
                  value={CREATE_NEW}
                  control={<Radio />}
                  label="None of these — this is somebody new"
                />
              </RadioGroup>
            </Box>
          )
        ) : null}

        {chosen?.operatorState ? (
          <Notice severity="warning" testId="already-has-login">
            {chosen.name} already has an operator login ({chosen.operatorState}). One person has one
            login, however many roles they hold — open their record instead to give them another
            role, resend their invitation, or restore their access.
          </Notice>
        ) : null}
      </Section>

      <Box component="form" action={inviteAction} onSubmit={inviteSlot.claim}>
        <Section title="What are they being invited to do?">
          <Stack spacing={2}>
            <input type="hidden" name="personId" value={personId} />
            <input type="hidden" name="givenName" value={givenName} />
            <input type="hidden" name="familyName" value={familyName} />
            <input type="hidden" name="email" value={email} />
            <input type="hidden" name="phone" value={phone} />

            <Field
              select
              name="roleCode"
              label="Role"
              value={roleCode}
              onChange={(event) => setRoleCode(event.target.value)}
              required
            >
              {roles.map((role) => (
                <MenuItem key={role.code} value={role.code}>
                  {role.groupLabel} — {role.label}
                </MenuItem>
              ))}
            </Field>

            <DateField
              name="effectiveFrom"
              label="Starts"
              value={effectiveFrom}
              onChange={setEffectiveFrom}
              helperText="Day, month, year. Leave blank for today; a future date is fine."
            />
            <Field
              name="reason"
              label="Reason (optional)"
              helperText="Required only when the start date is before today."
              multiline
              minRows={2}
            />

            <ActionBar
              sticky={false}
              primary={
                <Button
                  type="submit"
                  variant="contained"
                  disabled={
                    sending || roleCode === "" || email.trim() === "" || Boolean(phoneFormatError)
                  }
                  sx={{ minHeight: 44 }}
                >
                  {sending ? "Sending invitation…" : "Send invitation"}
                </Button>
              }
              cancel={<Button href="/operate/admin/operators">Cancel</Button>}
              note={
                phoneFormatError
                  ? "Correct the phone number to send."
                  : roleCode === "" || email.trim() === ""
                    ? "Choose a role and enter an email address to send."
                    : undefined
              }
            />
          </Stack>

          <AdminOutcome state={invite} showing={inviteSlot.showing} />
        </Section>
      </Box>
    </Stack>
  );
}
