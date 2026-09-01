"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { Aside, Scaffold, StatusChip } from "./chrome";
import { SEASON_LABEL, type Recruit } from "./fixtures";
import type { RecruitmentStore } from "./store";

/**
 * `W6` — add a recruit by hand, with `W8`'s duplicate check inside it.
 *
 * The shipped `/operate/people/new` form, wearing recruitment's shell, at a
 * proposed `/operate/recruitment/new`. Everything here is that form's:
 * four fields in the same order and with the same labels as adding a player,
 * a `CHECK FOR DUPLICATES` step, candidate rows, and a per-candidate `THIS IS
 * THEM`.
 *
 * ## Why the check is here and not on a page of its own
 *
 * Brian, 2026-08-31: "This is happening inside of the people page. I don't want
 * this to happen inside people. This is on the recruit page… I'm not going to
 * the people page to do this." So `W8` is not a place an operator visits. The
 * check is a **step inside whichever door is open**, rendered on that door's
 * own surface — and the parked review queue that used to be `W8-02` is gone
 * entirely, replaced by one question asked at the QR door of the person
 * standing there.
 *
 * ## Two additions, and one of them is the whole reason this door differs
 *
 * The **Academic** section beneath the four shipped fields holds College and
 * Matriculation year — the person record's own fields, in the order the missing
 * -data filter lists them, under a section heading the shipped person-edit form
 * already uses.
 *
 * **How the club came by this number** is the opt-in evidence. Task 09 § 9.1 is
 * explicit that operator manual add carries no natural opt-in — a number
 * sourced in conversation was not given by its owner for this purpose — so this
 * door has to capture one the other two doors get for free. It is a control
 * rather than an amber panel, because a panel only talks about it.
 */

interface Candidate {
  readonly name: string;
  readonly identity: string;
  readonly contact: string;
  readonly matched: string;
  readonly status: "player" | "recruit" | "past";
}

/**
 * Each candidate says **who it is**, in the club's own vocabulary.
 *
 * Brian: "I want to see what their status is. Are they a part of the current
 * season? Are they already a player on the season? Are they another recruit?
 * Who are they, because it could have the same name." The shipped rows give a
 * name, a contact line and the matched fields, and none of that separates two
 * Brindlewoods.
 */
const CANDIDATES: readonly Candidate[] = Object.freeze([
  Object.freeze({
    name: "Marguerite Ashdown",
    identity: `Recruit · committed · ${SEASON_LABEL}`,
    contact: "Mobile ending 461 · m.ashdown@example.ac.uk",
    matched: "Matched on first name, last name and mobile",
    status: "recruit" as const,
  }),
  Object.freeze({
    name: "Margarethe Ashdowne",
    identity: `Player · Active · ${SEASON_LABEL}`,
    contact: "Mobile ending 908",
    matched: "Matched on a similar last name",
    status: "player" as const,
  }),
]);

export default function AddRecruit({
  store,
  onCancel,
  onOpenRecruit,
}: {
  store: RecruitmentStore;
  onCancel: () => void;
  onOpenRecruit: (id: string) => void;
}) {
  const [given, setGiven] = useState("Marguerite");
  const [family, setFamily] = useState("Ashdown");
  const [mobile, setMobile] = useState("07700 900461");
  const [email, setEmail] = useState("m.ashdown@example.ac.uk");
  const [college, setCollege] = useState("Kestrelhall");
  const [matric, setMatric] = useState("2026");
  const [optIn, setOptIn] = useState("");
  const [optInNote, setOptInNote] = useState("They gave it to us at the Freshers' Fair");
  const [checked, setChecked] = useState(false);
  const [created, setCreated] = useState<Recruit | null>(null);

  const complete = given.trim() !== "" && family.trim() !== "" && mobile.trim() !== "";

  function create() {
    const id = `p-added-${Date.now()}`;
    const recruit: Recruit = {
      id,
      personId: `person-${id}`,
      givenName: given.trim(),
      familyName: family.trim(),
      displayName: `${given.trim()} ${family.trim()}`,
      aliases: [],
      college: college.trim() || null,
      matriculationYear: matric.trim() === "" ? null : Number(matric),
      expectedGraduationYear: null,
      degreeField: null,
      mobile: mobile.trim() || null,
      email: email.trim() || null,
      status: "identified",
      source: "Operator · sourced",
      firstContactOn: "14 May 2026",
      committedOn: null,
      exitReason: null,
      notes:
        optInNote.trim() === ""
          ? []
          : [
              {
                body: `How we came by this number: ${optInNote.trim()}`,
                author: "Caspian Hallowfield",
                at: "14 May 2026",
              },
            ],
      // The evidence makes the send lawful, so the form goes out; the consent
      // itself is not granted until they tick the box on it.
      consent: optIn === "" ? "never_asked" : "asked",
      consentOn: null,
      questionnaireASentOn: optIn === "" ? [] : ["14 May 2026"],
      questionnaireAAnswers: null,
      questionnaireBSentOn: [],
      questionnaireBAnswers: null,
      events: [],
      audit: [
        ...(optIn === ""
          ? [
              {
                summary: "Sign-up form not sent · no opt-in evidence recorded",
                detail: "14 May 2026 · the record says why",
              },
            ]
          : [
              {
                summary: "Sign-up form sent · WhatsApp template",
                detail: "14 May 2026 · queued",
              },
            ]),
        {
          summary: "Added as identified · operator add, sourced",
          detail: "14 May 2026 · Caspian Hallowfield",
        },
      ],
    };
    store.addRecruit(recruit);
    setCreated(recruit);
  }

  if (created) {
    return (
      <Stack spacing={3} sx={{ maxWidth: 720 }}>
        <Typography variant="h6" component="h1">
          {`${created.displayName} is on the board`}
        </Typography>
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              <StatusChip status={created.status} />
              <Typography variant="body2">{created.source}</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {optIn === ""
                ? "No opt-in evidence was recorded, so nothing was sent. The record says why, and the board's Contactable column is where an operator notices."
                : "One WhatsApp template went out, carrying the sign-up form on a link that is theirs. Nothing else sends until they tick the consent box on it."}
            </Typography>
          </Stack>
        </Paper>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <Button
            variant="contained"
            onClick={() => onOpenRecruit(created.id)}
            sx={{ minHeight: 44 }}
          >
            Open their record
          </Button>
          <Button variant="outlined" onClick={onCancel} sx={{ minHeight: 44 }}>
            Back to recruitment
          </Button>
        </Stack>
      </Stack>
    );
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 880 }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ justifyContent: "space-between", alignItems: { sm: "flex-start" } }}
      >
        <Box>
          <Button size="small" onClick={onCancel} sx={{ p: 0, textTransform: "none" }}>
            ← Recruitment
          </Button>
          <Typography variant="h6" component="h1">
            Add a recruit
          </Typography>
        </Box>
        <Stack direction="row" spacing={2}>
          <Button onClick={onCancel}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!complete}
            onClick={() => setChecked(true)}
            sx={{ minHeight: 44 }}
          >
            Check for duplicates
          </Button>
        </Stack>
      </Stack>

      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
        <Stack spacing={3}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Who they are
          </Typography>
          <TextField
            label="First name"
            required
            value={given}
            onChange={(e) => setGiven(e.target.value)}
            fullWidth
          />
          <TextField
            label="Last name"
            required
            value={family}
            onChange={(e) => setFamily(e.target.value)}
            fullWidth
          />
          <TextField
            label="Mobile phone"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            fullWidth
          />
          <TextField
            label="Personal email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            fullWidth
          />

          <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 2 }}>
            <Stack spacing={3}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Academic
              </Typography>
              <TextField
                label="College"
                value={college}
                onChange={(e) => setCollege(e.target.value)}
                fullWidth
              />
              <TextField
                label="Matriculation year"
                value={matric}
                onChange={(e) => setMatric(e.target.value)}
                fullWidth
              />
              <TextField
                select
                label="How we came by this number"
                value={optIn}
                onChange={(e) => setOptIn(e.target.value)}
                fullWidth
                helperText="This door's opt-in evidence. Without it the recruit is still created and nothing is sent."
              >
                <MenuItem value="">
                  <em>Not recorded</em>
                </MenuItem>
                <MenuItem value="gave_it">They gave it to us themselves</MenuItem>
                <MenuItem value="passed_on">A member passed it on with their agreement</MenuItem>
                <MenuItem value="public">
                  It is publicly listed and they expect to hear from clubs
                </MenuItem>
                <MenuItem value="other">Something else — written below</MenuItem>
              </TextField>
              <TextField
                label="In your own words"
                value={optInNote}
                onChange={(e) => setOptInNote(e.target.value)}
                fullWidth
                multiline
                minRows={2}
                helperText="Free text alone is unauditable and a tick alone records nothing, so this door asks for both. Proposed, and open."
              />
            </Stack>
          </Box>
        </Stack>
      </Paper>

      {checked ? (
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
          <Stack spacing={2}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Already in the club
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Two records look like this person. Nothing has been written yet.
            </Typography>
            {CANDIDATES.map((candidate) => (
              <Paper key={candidate.name} variant="outlined" sx={{ p: 2 }}>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={2}
                  sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body1" sx={{ fontWeight: 700 }}>
                      {candidate.name}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: "primary.main" }}>
                      {candidate.identity}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {candidate.contact}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {candidate.matched}
                    </Typography>
                  </Box>
                  <Button
                    variant="outlined"
                    onClick={() => {
                      const existing = store.recruits.find(
                        (recruit) => recruit.displayName === candidate.name,
                      );
                      if (existing) onOpenRecruit(existing.id);
                      else onCancel();
                    }}
                    sx={{ minHeight: 44, flexShrink: 0 }}
                  >
                    This is them
                  </Button>
                </Stack>
                {candidate.status === "player" ? (
                  <Alert severity="warning" sx={{ mt: 2 }}>
                    They already hold a membership this season. A player is not a recruit — this
                    door says so and refuses, rather than creating a prospect beside a membership.
                  </Alert>
                ) : null}
                {candidate.status === "recruit" ? (
                  <Alert severity="info" sx={{ mt: 2 }}>
                    They are already a recruit this season. The unique constraint on{" "}
                    <code>(person_id, season_id)</code> refuses a second one, so this offers their
                    record instead of an error.
                  </Alert>
                ) : null}
              </Paper>
            ))}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <Button variant="contained" onClick={create} sx={{ minHeight: 44 }}>
                This is somebody new
              </Button>
              <Button variant="outlined" onClick={() => setChecked(false)} sx={{ minHeight: 44 }}>
                Go back and change the details
              </Button>
            </Stack>
            <Aside>
              Nothing is created and nothing is messaged until a human decides. That is the locked
              rule at the centre of this mission, and it is why an existing member never receives a
              &ldquo;welcome to the club&rdquo; message.
            </Aside>
          </Stack>
        </Paper>
      ) : null}

      <Scaffold title="Three doors, three deliberate postures">
        <Box component="ul" sx={{ m: 0, pl: 3, color: "text.secondary" }}>
          <li>
            <strong>Walk-up</strong> — no check at all. Written on a phone at the side of a pitch;
            Brian removed the match path himself.
          </li>
          <li>
            <strong>Operator add</strong> — this door. The full check, at the door, with each
            candidate&rsquo;s identity on it. An operator at a desk, with time.
          </li>
          <li>
            <strong>QR sign-in</strong> — one question, answered by the person standing there, who
            is the one who knows.
          </li>
        </Box>
        <Aside>
          They look like an inconsistency and are not. Whatever still slips through goes to the
          people table&rsquo;s own merge, which already ships and belongs to Mission 5 — this
          mission does not own merging.
        </Aside>
      </Scaffold>
    </Stack>
  );
}
