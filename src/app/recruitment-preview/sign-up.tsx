"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { Aside, RecruitFrame, Scaffold } from "./chrome";
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
  const [preferred, setPreferred] = useState("");
  const [college, setCollege] = useState("");
  const [year, setYear] = useState("");
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
      setPreferred("");
      setCollege("Kestrelhall");
      setYear("First year");
    } else {
      setGiven("");
      setFamily("");
      setMobile("");
      setEmail("");
      setPreferred("");
      setCollege("");
      setYear("");
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
        <Aside>
          Note what the address bar says in each case. The QR points at a public page on the
          club&rsquo;s own domain; the WhatsApp link is a signed link that exposes only that
          person&rsquo;s own flow and never the roster, another person, or anything about the
          club&rsquo;s other recruits.
        </Aside>
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
              sends. `preferred name`, `college` and `year` are Mission 5's own
              fields; this mission owns the asking, never the fields.
            */}
            <TextField
              label="What we should call you"
              value={preferred}
              onChange={(e) => setPreferred(e.target.value)}
              fullWidth
              helperText="Only if it differs from your first name."
            />
            <TextField
              label="College"
              value={college}
              onChange={(e) => setCollege(e.target.value)}
              fullWidth
            />
            <TextField
              select
              label="Year"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              fullWidth
            >
              <MenuItem value="">(no answer)</MenuItem>
              <MenuItem value="First year">First year</MenuItem>
              <MenuItem value="Second year">Second year</MenuItem>
              <MenuItem value="Third year">Third year</MenuItem>
              <MenuItem value="Fourth year or beyond">Fourth year or beyond</MenuItem>
              <MenuItem value="Postgraduate">Postgraduate</MenuItem>
            </TextField>

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

            <Typography sx={{ fontSize: 14, color: "text.secondary", fontStyle: "italic" }}>
              Nothing here is required except a name and a way to reach you, and nothing here gates
              anything. You can leave the tick off and still sign up — it only decides whether we
              may message you.
            </Typography>
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

            <Typography sx={{ fontSize: 14, color: "text.secondary", fontStyle: "italic" }}>
              Yes adds nothing and takes them on. No creates them as a new person and takes them on.
              Nobody is held, nothing is refused, and a duplicate that slips through is resolved
              later in the people table&rsquo;s own merge — which already ships and belongs to
              Mission 5.
            </Typography>
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

            <Typography sx={{ fontSize: 14, color: "text.secondary", fontStyle: "italic" }}>
              Signing in a second time reaches this same page: the details are taken again and
              reconciled later, and nothing reads as an error. That is the common case at a second
              event.
            </Typography>
          </Stack>
        ) : null}
      </RecruitFrame>

      <Scaffold title="Try the gate">
        <Typography variant="body2" color="text.secondary">
          Submit with the box ticked and with it left off, on both doors. The group link appears in
          exactly one of those four outcomes, and it is the only place in the whole product where a
          recruit is handed it.
        </Typography>
        <Aside>
          <strong>Open, and Brian&rsquo;s.</strong> &ldquo;A login&rdquo; is read here as the signed
          link and the group invite, never an account: Task 08 § 3 fixes that there are no player
          logins in Release One, and creating one for recruits would be a larger decision than this
          workflow can make. Flagged rather than assumed.
        </Aside>
      </Scaffold>
    </Stack>
  );
}
