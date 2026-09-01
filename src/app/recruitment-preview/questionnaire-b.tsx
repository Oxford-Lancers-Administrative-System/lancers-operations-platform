"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { Aside, RecruitFrame, Scaffold } from "./chrome";
import { SIGN_UP_URL } from "./fixtures";

/**
 * `W4`, Questionnaire B — how you came to football.
 *
 * The recruit-stage field set, never enumerated by anyone before this intake.
 * Task 08 § 4 records that football background, experience and gear ownership
 * were deliberately not carried into the person inventory and were routed
 * here; Mission 5's approved packet records the set as an open unknown. So this
 * is the **first enumeration anywhere**, and it is `proposed for owner
 * approval`, not settled.
 *
 * Brian amended an earlier six on 2026-08-31:
 *
 * - **Year and college are gone from this one** — "Whether they're in college
 *   is something we already asked." They belong to Questionnaire A, which the
 *   consent model has since folded into the sign-up form.
 * - **"Played before" became two questions, both yes/no** — "Have they ever
 *   played American football before? Have they ever watched American football?"
 * - **`Anything else` is retained but not confirmed.**
 *
 * Route: `/a/[token]` — the shared signed-link substrate, built once here and
 * extended by Missions 7 and 8 with their own field sets. Every control below
 * is the shipped `QuestionField`'s: a `select` for a boolean or a choice, a
 * plain text field otherwise.
 *
 * **Every field is optional and nothing gates.** Missing information never
 * blocks a capture and never blocks the flip.
 */

type State = "form" | "saved" | "already" | "invalid";

const POSITIONS = [
  "No preference",
  "Quarterback",
  "Running back",
  "Wide receiver",
  "Offensive line",
  "Defensive line",
  "Linebacker",
  "Defensive back",
  "Kicker",
];

const GEAR = ["None", "Boots only", "Boots and gloves", "Full pads", "Something else"];

const HEARD = [
  "Freshers' Fair",
  "A friend or teammate",
  "A poster or QR code",
  "Social media",
  "Somewhere else",
];

export default function QuestionnaireB() {
  const [state, setState] = useState<State>("form");
  const [played, setPlayed] = useState("");
  const [watched, setWatched] = useState("");
  const [position, setPosition] = useState("");
  const [gear, setGear] = useState("");
  const [heard, setHeard] = useState("");
  const [anything, setAnything] = useState("");

  const domain = SIGN_UP_URL.split("/")[0];

  return (
    <Stack spacing={3}>
      <Scaffold
        title="Link states"
        action={
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
            <Button
              size="small"
              variant={state === "form" ? "contained" : "outlined"}
              onClick={() => setState("form")}
            >
              Open
            </Button>
            <Button
              size="small"
              variant={state === "already" ? "contained" : "outlined"}
              onClick={() => setState("already")}
            >
              Already answered
            </Button>
            <Button
              size="small"
              variant={state === "invalid" ? "contained" : "outlined"}
              onClick={() => setState("invalid")}
            >
              Expired or revoked
            </Button>
          </Stack>
        }
      >
        <Typography variant="body2" color="text.secondary">
          The link acts as the person and exposes only their own flow — never the roster, never
          another person, never anything about the club&rsquo;s other recruits. There is no login,
          by Task 08 § 3&rsquo;s decision that there are no player logins in Release One.
        </Typography>
        <Aside>
          The expired state is the <strong>uniform invalid page</strong>, and it is the same page
          for expired, revoked and never-existed. It says nothing about whether the token was ever
          real, which is the whole point: a page that distinguishes them is a page that answers
          questions for somebody guessing tokens.
        </Aside>
      </Scaffold>

      <RecruitFrame url={state === "invalid" ? `${domain}/a/expired…` : `${domain}/a/7b21f4e9c…`}>
        {state === "form" ? (
          <Stack spacing={3}>
            <Typography
              sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: "primary.main" }}
            >
              ROSALIND PENHALIGON
            </Typography>
            <Box>
              <Typography component="h1" sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 700 }}>
                About your football experience
              </Typography>
              <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1 }}>
                So the coaches know where to start with you. There are no wrong answers and nothing
                here decides whether you can play. Every question is optional.
              </Typography>
            </Box>

            <TextField
              select
              label="Have you played American football before?"
              value={played}
              onChange={(e) => setPlayed(e.target.value)}
              fullWidth
            >
              <MenuItem value="">(no answer)</MenuItem>
              <MenuItem value="Yes">Yes</MenuItem>
              <MenuItem value="No">No</MenuItem>
            </TextField>

            <TextField
              select
              label="Have you watched American football before?"
              value={watched}
              onChange={(e) => setWatched(e.target.value)}
              fullWidth
            >
              <MenuItem value="">(no answer)</MenuItem>
              <MenuItem value="Yes">Yes</MenuItem>
              <MenuItem value="No">No</MenuItem>
            </TextField>

            <TextField
              select
              label="Which position interests you?"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              fullWidth
              helperText="Nothing binding — a conversation opener for a coach."
            >
              <MenuItem value="">(no answer)</MenuItem>
              {POSITIONS.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="What playing gear do you already have?"
              value={gear}
              onChange={(e) => setGear(e.target.value)}
              fullWidth
              helperText="So we know whether you need kit to turn up at all."
            >
              <MenuItem value="">(no answer)</MenuItem>
              {GEAR.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="How did you hear about the Lancers?"
              value={heard}
              onChange={(e) => setHeard(e.target.value)}
              fullWidth
            >
              <MenuItem value="">(no answer)</MenuItem>
              {HEARD.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Anything else you would like us to know?"
              value={anything}
              onChange={(e) => setAnything(e.target.value)}
              fullWidth
              multiline
              minRows={2}
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />

            <Button variant="contained" onClick={() => setState("saved")} sx={{ minHeight: 48 }}>
              Send my answers
            </Button>

            <Typography sx={{ fontSize: 14, color: "text.secondary", fontStyle: "italic" }}>
              Nothing here gates anything: missing answers never block a capture and never block the
              flip. One polite reminder follows if it goes unanswered, and then nothing.
            </Typography>
          </Stack>
        ) : null}

        {state === "saved" ? (
          <Stack spacing={3}>
            <Typography component="h1" sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 700 }}>
              Thank you — that is with us
            </Typography>
            <Typography sx={{ fontSize: 15, color: "text.secondary" }}>
              A coach will have a look before the next session. You do not need to do anything else.
            </Typography>
            <Button variant="text" onClick={() => setState("form")} sx={{ minHeight: 48 }}>
              Change an answer
            </Button>
            <Typography sx={{ fontSize: 14, color: "text.secondary", fontStyle: "italic" }}>
              Answering is an interaction, so it moves <code>identified → engaged</code> where the
              recruit is not already there. Nothing else moves. If they answer twice the later
              answer supersedes and the earlier one is kept.
            </Typography>
          </Stack>
        ) : null}

        {state === "already" ? (
          <Stack spacing={3}>
            <Typography component="h1" sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 700 }}>
              You have already answered this
            </Typography>
            <Typography sx={{ fontSize: 15, color: "text.secondary" }}>
              Nothing has changed and nothing needs doing. You can change an answer if you want to.
            </Typography>
            <Button variant="contained" onClick={() => setState("form")} sx={{ minHeight: 48 }}>
              Change an answer
            </Button>
            <Typography sx={{ fontSize: 14, color: "text.secondary", fontStyle: "italic" }}>
              A friendly page saying so, changing nothing. This is not an error and must not read as
              one.
            </Typography>
          </Stack>
        ) : null}

        {state === "invalid" ? (
          <Stack spacing={3}>
            <Typography component="h1" sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 700 }}>
              This link is not available
            </Typography>
            <Typography sx={{ fontSize: 15, color: "text.secondary" }}>
              If somebody at the club sent it to you, ask them to send it again.
            </Typography>
            <Typography sx={{ fontSize: 14, color: "text.secondary", fontStyle: "italic" }}>
              The same page for expired, revoked and never-existed. No information leakage, per the
              uniform-invalid precedent — it does not say whether the token was ever real.
            </Typography>
          </Stack>
        ) : null}
      </RecruitFrame>

      <Scaffold title="The six fields are proposed, not settled">
        <Typography variant="body2" color="text.secondary">
          This is the first time anybody has written the recruit-stage field set down. Brian:
          &ldquo;We need to figure out what those look like.&rdquo; He amended an earlier six and
          approved the workflow — &ldquo;W4 seems fine. Approved.&rdquo; — but the set itself is
          still open, and <code>Anything else</code> is retained without being confirmed.
        </Typography>
        <Aside>
          Also open, and explicitly his:{" "}
          <strong>when the two questionnaires go out, and whether they are ever combined.</strong>{" "}
          &ldquo;We&rsquo;ll figure out when they get put together. I&rsquo;m doing that.&rdquo; The
          consent model has already combined one of them with the sign-up form; whether this one
          joins them is not decided here.
        </Aside>
      </Scaffold>
    </Stack>
  );
}
