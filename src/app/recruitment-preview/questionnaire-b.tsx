"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Checkbox from "@mui/material/Checkbox";
import ListItemText from "@mui/material/ListItemText";
import ListSubheader from "@mui/material/ListSubheader";
import { RecruitFrame, Scaffold } from "./chrome";
import { GEAR_ITEMS, POSITION_GROUPS, SIGN_UP_URL } from "./fixtures";

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
  const [position, setPosition] = useState<string[]>([]);
  const [gear, setGear] = useState<string[]>([]);
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
                Football background
              </Typography>
              <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1 }}>
                For the coaching staff. Every question is optional.
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

            {/*
              Multi-select, over the season's own vocabulary, grouped by section
              — Brian, 2026-09-01. A recruit is allowed to be interested in more
              than one thing, and picking a side is not the question.
            */}
            <TextField
              select
              label="Which positions interest you?"
              value={position}
              onChange={(e) =>
                setPosition(
                  typeof e.target.value === "string" ? e.target.value.split(",") : e.target.value,
                )
              }
              fullWidth
              slotProps={{
                select: {
                  multiple: true,
                  renderValue: (selected) => (selected as string[]).join(", ") || "",
                  MenuProps: { slotProps: { paper: { sx: { maxHeight: 360 } } } },
                },
              }}
            >
              {POSITION_GROUPS.flatMap((group) => [
                <ListSubheader key={group.label} sx={{ fontWeight: 700 }}>
                  {group.label}
                </ListSubheader>,
                ...group.positions.map((entry) => (
                  <MenuItem key={entry.code} value={`${entry.code} · ${entry.label}`}>
                    <Checkbox
                      size="small"
                      sx={{ p: 0, mr: 1 }}
                      checked={position.includes(`${entry.code} · ${entry.label}`)}
                    />
                    <ListItemText primary={`${entry.code} · ${entry.label}`} />
                  </MenuItem>
                )),
              ])}
            </TextField>

            {/*
              One item at a time, not combinations — Brian, 2026-09-01. "Boots
              only" and "Boots and gloves" made somebody with boots and a helmet
              pick the nearest wrong answer.
            */}
            <TextField
              select
              label="What playing gear do you already have?"
              value={gear}
              onChange={(e) =>
                setGear(
                  typeof e.target.value === "string" ? e.target.value.split(",") : e.target.value,
                )
              }
              fullWidth
              slotProps={{
                select: {
                  multiple: true,
                  renderValue: (selected) => (selected as string[]).join(", ") || "",
                },
              }}
            >
              {GEAR_ITEMS.map((item) => (
                <MenuItem key={item} value={item}>
                  <Checkbox size="small" sx={{ p: 0, mr: 1 }} checked={gear.includes(item)} />
                  <ListItemText primary={item} />
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
              label="Anything else"
              value={anything}
              onChange={(e) => setAnything(e.target.value)}
              fullWidth
              multiline
              minRows={2}
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />

            <Button variant="contained" onClick={() => setState("saved")} sx={{ minHeight: 48 }}>
              Submit
            </Button>
          </Stack>
        ) : null}

        {state === "saved" ? (
          <Stack spacing={3}>
            <Typography component="h1" sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 700 }}>
              Answers received
            </Typography>
            <Typography sx={{ fontSize: 15, color: "text.secondary" }}>
              Nothing further is needed.
            </Typography>
            <Button variant="text" onClick={() => setState("form")} sx={{ minHeight: 48 }}>
              Change an answer
            </Button>
          </Stack>
        ) : null}

        {state === "already" ? (
          <Stack spacing={3}>
            <Typography component="h1" sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 700 }}>
              Already completed
            </Typography>
            <Typography sx={{ fontSize: 15, color: "text.secondary" }}>
              You can change any answer.
            </Typography>
            <Button variant="contained" onClick={() => setState("form")} sx={{ minHeight: 48 }}>
              Change an answer
            </Button>
          </Stack>
        ) : null}

        {state === "invalid" ? (
          <Stack spacing={3}>
            <Typography component="h1" sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 700 }}>
              This link is no longer valid
            </Typography>
            <Typography sx={{ fontSize: 15, color: "text.secondary" }}>
              Contact the club for a new one.
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
      </Scaffold>
    </Stack>
  );
}
