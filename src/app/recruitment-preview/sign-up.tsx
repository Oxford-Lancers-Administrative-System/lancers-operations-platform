"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { RecruitFrame, Scaffold } from "./chrome";
import { GROUP_LINK, SEASON_LABEL, SIGN_UP_URL } from "./fixtures";

/**
 * `W7` — sign yourself in. **The single consent gate**, and the same surface as
 * Questionnaire A.
 *
 * The consent model settled with Brian on 2026-08-31 supersedes `W4`, `W5`,
 * `W6`, `W7` and `W10` where they disagree, and this page is where most of it
 * lands:
 *
 * - **The sign-up form is the single consent gate**, and it is the personal
 *   details questionnaire. Every door leads here.
 * - **QR** points straight at it. **Walk-up** and **operator add** send exactly
 *   one WhatsApp template carrying a signed, prefilled link to it.
 * - **No WhatsApp message ever asks permission to send WhatsApp messages.**
 *   Consent is collected on this form, never in the chat.
 * - Consent is **season-scoped**. Granted for a season it carries from recruit
 *   through onboarding to player; each new season is re-approved.
 * - **Ticking consent and saving is what reveals the community group link**, on
 *   the saved page. Never before.
 *
 * ## Both entry paths, because they are not the same page
 *
 * **Anonymous, from the QR** — nothing is known, every field is empty, and the
 * page asks one question afterwards: have you signed up with us before? The
 * person standing at the stand is the one who knows, which is why that question
 * needs no operator, no queue, no notification and no surface.
 *
 * **Tokenised, from a WhatsApp link** — the person already exists, the link
 * acts as them, the fields arrive filled in, and there is no duplicate question
 * at all, because there is nothing to ask.
 *
 * ## The one thing this screen must not become
 *
 * A stranger can type any name. If the page then showed that person's number
 * and email back, the QR code would be a lookup tool for the club's contact
 * details. So the match is confirmed only in terms the visitor **already
 * supplied** — a first name they typed and the last three digits of the number
 * they typed. Nothing is revealed that they did not already know.
 */

type Entry = "qr" | "token";
type Step = "form" | "already" | "saved";

export default function SignUpForm() {
  const [entry, setEntry] = useState<Entry>("qr");
  const [step, setStep] = useState<Step>("form");
  const [given, setGiven] = useState("");
  const [family, setFamily] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [knownAs, setKnownAs] = useState("");
  const [college, setCollege] = useState("");
  const [matric, setMatric] = useState("");
  const [grad, setGrad] = useState("");
  const [degree, setDegree] = useState("");
  const [consent, setConsent] = useState(false);

  function switchEntry(next: Entry) {
    setEntry(next);
    setStep("form");
    setConsent(false);
    if (next === "token") {
      setGiven("Marguerite");
      setFamily("Ashdown");
      setMobile("07700 900461");
      setEmail("m.ashdown@example.ac.uk");
      setKnownAs("");
      setCollege("Kestrelhall");
      setMatric("2026");
      setGrad("2029");
      setDegree("Law");
    } else {
      setGiven("");
      setFamily("");
      setMobile("");
      setEmail("");
      setKnownAs("");
      setCollege("");
      setMatric("");
      setGrad("");
      setDegree("");
    }
  }

  const url = entry === "qr" ? SIGN_UP_URL : `${SIGN_UP_URL.split("/")[0]}/a/7b21f4e9c…`;
  const ready = given.trim() !== "" && family.trim() !== "" && mobile.trim() !== "";

  return (
    <Stack spacing={3}>
      <Scaffold
        title="Which door they came through"
        action={
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant={entry === "qr" ? "contained" : "outlined"}
              onClick={() => switchEntry("qr")}
            >
              QR · anonymous
            </Button>
            <Button
              size="small"
              variant={entry === "token" ? "contained" : "outlined"}
              onClick={() => switchEntry("token")}
            >
              WhatsApp link · prefilled
            </Button>
          </Stack>
        }
      >
        <Typography variant="body2" color="text.secondary">
          {entry === "qr"
            ? "Scanned at the stand. The club knows nothing about them, so every field is empty and the page asks one question after they submit."
            : "Sent to somebody the club already has — a walk-up, or an operator add. The link acts as them, the fields arrive filled in, and there is no duplicate question, because there is nothing to ask."}
        </Typography>
      </Scaffold>

      <RecruitFrame url={url}>
        {step === "form" ? (
          <Stack spacing={3}>
            {entry === "token" ? (
              <Typography
                sx={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  color: "primary.main",
                }}
              >
                MARGUERITE ASHDOWN
              </Typography>
            ) : null}
            <Box>
              <Typography component="h1" sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 700 }}>
                Join the Oxford Lancers
              </Typography>
              <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1 }}>
                {entry === "qr"
                  ? "Leave your name and a way to reach you. We will send you a WhatsApp message about the next session."
                  : "We already have most of this. Check it, change anything that is wrong, and tell us how we may contact you."}
              </Typography>
              <Typography sx={{ fontSize: 15, fontWeight: 600, mt: 1.5 }}>
                Only the first three are needed. The rest can wait.
              </Typography>
            </Box>

            <TextField
              label="First name"
              value={given}
              onChange={(e) => setGiven(e.target.value)}
              required
              fullWidth
            />
            <TextField
              label="Last name"
              value={family}
              onChange={(e) => setFamily(e.target.value)}
              required
              fullWidth
            />
            <TextField
              label="Mobile number"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              required
              fullWidth
            />
            <TextField
              label="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              fullWidth
            />

            {/*
              Questionnaire A, folded in. The consent model makes this form and
              the personal-details questionnaire the same surface, so the four
              fields above and the three below are one ask rather than two
              sends. `known as`, `college` and `matriculation year` are Mission 5's
              own fields;
              this mission owns the asking, never the fields. The first writes an
              alias — `person_aliases` — which is the field the application
              actually has, and is what the returner intake already calls
              "Known as".
            */}
            <TextField
              label="Known as"
              value={knownAs}
              onChange={(e) => setKnownAs(e.target.value)}
              fullWidth
              helperText="Only if it differs from your first name. It becomes an alias, so the club can find you by it."
            />
            <TextField
              label="College"
              value={college}
              onChange={(e) => setCollege(e.target.value)}
              fullWidth
            />
            {/*
              Matriculation year, not "Year".
              
              The form used to ask which year they were in, and the answer went
              nowhere: nothing on the board or the record displays it, because
              Brian dropped that field on 2026-09-01 in favour of the
              matriculation year — the stored fact, which does not go stale the
              way "First year" does at a season boundary. A form that asks a
              question nothing records is worse than one that does not ask.
            */}
            <TextField
              label="Matriculation year"
              value={matric}
              onChange={(e) => setMatric(e.target.value)}
              fullWidth
              helperText="The year you started at Oxford."
            />
            <TextField
              label="Expected graduation"
              value={grad}
              onChange={(e) => setGrad(e.target.value)}
              fullWidth
            />
            <TextField
              label="Degree"
              value={degree}
              onChange={(e) => setDegree(e.target.value)}
              fullWidth
            />

            {/* The gate. One tick, season-scoped, and it is the only place consent is collected. */}
            <Paper
              variant="outlined"
              sx={{ p: 2, borderColor: consent ? "primary.main" : "divider" }}
            >
              <FormControlLabel
                control={
                  <Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                }
                label={
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {`The Oxford Lancers may message me on WhatsApp about this season (${SEASON_LABEL}).`}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Session invitations and the odd polite reminder. Never more than one reminder,
                      never a chase, and you can stop it at any time from a link in any message. We
                      will ask you again next season.
                    </Typography>
                  </Box>
                }
              />
            </Paper>

            <Button
              variant="contained"
              disabled={!ready}
              onClick={() => setStep(entry === "qr" ? "already" : "saved")}
              sx={{ minHeight: 48 }}
            >
              {entry === "qr" ? "Sign me up" : "Save my details"}
            </Button>
          </Stack>
        ) : null}

        {step === "already" ? (
          <Stack spacing={3}>
            <Box>
              <Typography component="h1" sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 700 }}>
                Have you signed up with us before?
              </Typography>
              <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1 }}>
                We may already have you. If that is you, we will not add you twice — you will go
                straight to the group.
              </Typography>
            </Box>

            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="overline" sx={{ fontWeight: 700, color: "text.secondary" }}>
                We found
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {`${given.trim() || "Somebody"}, mobile ending ${mobile.replace(/\D/g, "").slice(-3) || "—"}`}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Only what you have already typed is shown back to you.
              </Typography>
            </Paper>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <Button
                variant="contained"
                onClick={() => setStep("saved")}
                sx={{ minHeight: 48, flex: 1 }}
              >
                Yes, that&rsquo;s me
              </Button>
              <Button
                variant="outlined"
                onClick={() => setStep("saved")}
                sx={{ minHeight: 48, flex: 1 }}
              >
                No, I&rsquo;m new
              </Button>
            </Stack>
          </Stack>
        ) : null}

        {step === "saved" ? (
          <Stack spacing={3}>
            <Box>
              <Typography component="h1" sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 700 }}>
                {`You're in${given.trim() ? `, ${given.trim()}` : ""}`}
              </Typography>
              <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1 }}>
                {consent
                  ? "Last thing — join the WhatsApp group. That is where the club says when and where the next session is."
                  : "We have your details, and that is enough to sign you up. We will not message you."}
              </Typography>
            </Box>

            {consent ? (
              <>
                {/*
                  The group link is revealed **here and never before**. It is the
                  reward for the tick, not a thing on the form, which is what
                  keeps the consent decision from being something a recruit
                  scrolls past on the way to the group.
                */}
                <Button variant="contained" sx={{ minHeight: 48 }} href={`https://${GROUP_LINK}`}>
                  Join the WhatsApp group
                </Button>
                <Alert severity="success">
                  <AlertTitle
                    sx={{ fontWeight: 700 }}
                  >{`Consent recorded for ${SEASON_LABEL}.`}</AlertTitle>
                  You can stop it at any time from the link at the foot of any message we send. We
                  will ask you again next season.
                </Alert>
              </>
            ) : (
              <Alert severity="info">
                <AlertTitle sx={{ fontWeight: 700 }}>We will not message you.</AlertTitle>
                {`You did not tick the box, so nothing is sent — no invitation, no reminder, nothing. Your details are kept and somebody at the club can still talk to you in person. If you change your mind, scan the code again and tick it.`}
              </Alert>
            )}

            <Button variant="text" onClick={() => setStep("form")} sx={{ minHeight: 48 }}>
              Change what I entered
            </Button>
          </Stack>
        ) : null}
      </RecruitFrame>

      <Scaffold title="Try the gate">
        <Typography variant="body2" color="text.secondary">
          Submit with the box ticked and with it left off, on both doors. The group link appears in
          exactly one of those four outcomes, and it is the only place in the whole product where a
          recruit is handed it.
        </Typography>
      </Scaffold>
    </Stack>
  );
}
