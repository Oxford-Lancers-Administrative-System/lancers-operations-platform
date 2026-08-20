"use client";

import { useActionState, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Stepper from "@mui/material/Stepper";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { inviteOperatorAction, searchCandidatesAction } from "../../actions";
import { EMPTY_ADMIN_ACTION_STATE } from "../../action-state";
import AdminOutcome from "../../outcome";

/** One assignable seat, as the page read it from the catalogue. */
export interface AssignableRole {
  readonly code: string;
  readonly label: string;
  readonly groupLabel: string;
}

/** The choice meaning "none of these people — create a new record". */
const CREATE_NEW = "";

/**
 * The guided invitation — `REQ-invite-existing-person`, LAN-133.
 *
 * ## The duplicate check comes first, and it is the point
 *
 * `DEC-minimal-person-creation`: "operator invitation includes duplicate-checked
 * create-or-link Person". The club's whole identity model rests on one durable
 * Person per human (`DEC-person-account-role-separation`), and the single most
 * likely way to break it is to invite somebody who is already a player by
 * typing their name into a blank form. So the same four fields feed the search
 * and the invitation: the administrator types who they mean once, is shown
 * everybody it might be, and either links one of them or says plainly that this
 * is somebody new.
 *
 * A candidate who already has an operator login is shown with the state of that
 * login. `inviteOperator` refuses them — one person has one login, however many
 * roles they hold — and saying so here means the refusal is understood before
 * it happens rather than after.
 *
 * ## The operating year is not a field
 *
 * `DEC-active-operating-year`: "Forms do not ask for or repeat the year." The
 * active context is inherited by the service and there is no control here that
 * could name another, which is also what makes a past year read-only — there is
 * no code path by which an assignment can be created in one.
 *
 * ## The fourth step is the operator's own record
 *
 * The reviewed prototype ends on a "Sent" panel. This ends by going to the
 * account that was just created, which is where the delivery result, the resend
 * control and the audit history already live — the same information, on the
 * page the administrator would have to open next anyway. A delivery failure
 * lands there too, with the reason, rather than on a confirmation screen that
 * would have to be a second place to recover from one.
 */
export default function InviteOperatorForm({ roles }: { roles: readonly AssignableRole[] }) {
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

      <Paper variant="outlined" sx={{ p: 2 }} component="section">
        <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>
          Who is this?
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Check first. If they are already in the club&rsquo;s records — as a player, a coach or an
          officer — link that record rather than creating a second one.
        </Typography>

        <Stack spacing={2}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="First name"
              value={givenName}
              onChange={(event) => setGivenName(event.target.value)}
              fullWidth
              required
            />
            <TextField
              label="Last name"
              value={familyName}
              onChange={(event) => setFamilyName(event.target.value)}
              fullWidth
              required
            />
          </Stack>
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            fullWidth
            required
            helperText="The invitation goes here, and this becomes their sign-in address."
          />
          <TextField
            label="Phone (optional)"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            fullWidth
          />

          <Box component="form" action={searchAction}>
            <input type="hidden" name="givenName" value={givenName} />
            <input type="hidden" name="familyName" value={familyName} />
            <input type="hidden" name="email" value={email} />
            <input type="hidden" name="phone" value={phone} />
            <Button type="submit" disabled={searching} sx={{ minHeight: 44 }}>
              Check for an existing person
            </Button>
          </Box>
        </Stack>

        <AdminOutcome state={{ ...search, notice: null, candidates: null }} />

        {search.candidates ? (
          search.candidates.length === 0 ? (
            <Alert severity="info" sx={{ mt: 2 }} data-testid="no-existing-person">
              Nobody in the club&rsquo;s records matches. A new record will be created for them.
            </Alert>
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
          <Alert severity="warning" sx={{ mt: 2 }} data-testid="already-has-login">
            {chosen.name} already has an operator login ({chosen.operatorState}). One person has one
            login, however many roles they hold — open their record instead to give them another
            role, resend their invitation, or restore their access.
          </Alert>
        ) : null}
      </Paper>

      <Box component="form" action={inviteAction}>
        <Paper variant="outlined" sx={{ p: 2 }} component="section">
          <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>
            What are they being invited to do?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            An invitation has to give at least one role. The operating year is the club&rsquo;s
            current one, and the role starts today unless you say otherwise.
          </Typography>

          <Stack spacing={2}>
            <input type="hidden" name="personId" value={personId} />
            <input type="hidden" name="givenName" value={givenName} />
            <input type="hidden" name="familyName" value={familyName} />
            <input type="hidden" name="email" value={email} />
            <input type="hidden" name="phone" value={phone} />

            <TextField
              select
              name="roleCode"
              label="Role"
              value={roleCode}
              onChange={(event) => setRoleCode(event.target.value)}
              required
              fullWidth
            >
              {roles.map((role) => (
                <MenuItem key={role.code} value={role.code}>
                  {role.groupLabel} — {role.label}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              name="effectiveFrom"
              type="date"
              label="Starts"
              slotProps={{ inputLabel: { shrink: true } }}
              helperText="Leave blank for today. A future date is fine."
              fullWidth
            />
            <TextField
              name="reason"
              label="Reason (optional)"
              helperText="Required only when the start date is before today."
              multiline
              minRows={2}
              fullWidth
            />

            <Box>
              <Button
                type="submit"
                variant="contained"
                disabled={sending || roleCode === "" || email.trim() === ""}
                sx={{ minHeight: 44 }}
              >
                Send invitation
              </Button>
            </Box>
          </Stack>

          <AdminOutcome state={invite} />
        </Paper>
      </Box>
    </Stack>
  );
}
