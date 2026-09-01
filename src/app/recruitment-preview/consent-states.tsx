"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { RecruitFrame, Scaffold, StatusChip } from "./chrome";
import {
  CONSENT_EFFECT,
  CONSENT_LABELS,
  CONSENT_PERMITS_SENDING,
  CONSENT_STATES,
  SEASON_LABEL,
  SIGN_UP_URL,
  type ConsentState,
} from "./fixtures";
import type { RecruitmentStore } from "./store";

/**
 * Consent, end to end — the ticket's item 11. **New; no approved screen
 * exists**, so every screen on this surface is proposed and none of it is
 * covered by an acceptance record.
 *
 * The consent model settled with Brian on 2026-08-31 fixes four things, and
 * everything drawn here follows from them:
 *
 * 1. **The sign-up form is the single consent gate.** Every door leads to it.
 *    There is nowhere else in the product where consent is given.
 * 2. **No WhatsApp message ever asks permission to send WhatsApp messages.**
 *    Consent is collected on the form, never in the chat — which is why the
 *    walk-up and operator-add doors send exactly one template, carrying the
 *    form, and nothing else until it comes back.
 * 3. **Consent is season-scoped**, keyed to the person and the season. Granted
 *    for a season it carries from recruit through onboarding to player; each new
 *    season is re-approved.
 * 4. **Ticking it and saving is what reveals the group link**, on the saved
 *    page. Never before.
 *
 * ## Where the club sees it, and where it bites
 *
 * On the recruit's record it is a row on the Recruitment card and a value in
 * the headline. What it *does* is gate every send in the product, through one
 * derived question — **may we message this person?** — which the record's
 * banner asks and answers with the cause named underneath.
 */

/** How each state is reached. Nothing here is set by an operator by hand. */
const REACHED_BY: Readonly<Record<ConsentState, string>> = Object.freeze({
  never_asked:
    "No door has sent them the form yet, or an operator add recorded no opt-in evidence.",
  asked: "The form was sent — one template, carrying its link — and has not come back.",
  granted: "They ticked the box on the sign-up form and saved it.",
  refused: "They opened the form and saved it without ticking the box.",
  withdrawn: "They used the opt-out link at the foot of a message the club sent them.",
});

/** How it reads on the record, in the club's own words. */
const ON_THE_RECORD: Readonly<Record<ConsentState, string>> = Object.freeze({
  never_asked: "Never asked — with no date, because nothing has happened.",
  asked: "Asked, no answer, dated the day the form went out.",
  granted: `Granted · dated, and scoped to ${SEASON_LABEL}.`,
  refused: "Refused — dated the day they saved the form without the tick.",
  withdrawn: "Withdrawn · dated, with the banner naming it as a channel refusal.",
});

export default function ConsentStates({ store }: { store: RecruitmentStore }) {
  const [optOutStep, setOptOutStep] = useState<"link" | "confirm" | "done">("link");
  const domain = SIGN_UP_URL.split("/")[0];

  return (
    <Stack spacing={4}>
      <Box>
        <Typography variant="h6" component="h1">
          Consent, end to end
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Five states, how each is reached, what it lets the club send, and how somebody gets out.
        </Typography>
      </Box>

      <Alert severity="info">
        <AlertTitle sx={{ fontWeight: 700 }}>
          Nothing on this surface has an approved screen behind it.
        </AlertTitle>
        The consent model is settled; its screens are not. Everything below is drawn from that model
        and is proposed. It is here because the model touches five workflows and none of them shows
        it whole.
      </Alert>

      <Paper variant="outlined" sx={{ overflowX: "auto" }}>
        <Table size="small" sx={{ minWidth: 900 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>State</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>How it is reached</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>What the club may send</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>On the record</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Who is in it</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {CONSENT_STATES.map((state) => {
              const people = store.recruits.filter((recruit) => recruit.consent === state);
              return (
                <TableRow key={state}>
                  <TableCell sx={{ verticalAlign: "top" }}>
                    <Chip
                      size="small"
                      label={CONSENT_LABELS[state]}
                      color={CONSENT_PERMITS_SENDING[state] ? "success" : "default"}
                      variant={CONSENT_PERMITS_SENDING[state] ? "filled" : "outlined"}
                    />
                  </TableCell>
                  <TableCell sx={{ verticalAlign: "top" }}>{REACHED_BY[state]}</TableCell>
                  <TableCell sx={{ verticalAlign: "top" }}>{CONSENT_EFFECT[state]}</TableCell>
                  <TableCell sx={{ verticalAlign: "top" }}>{ON_THE_RECORD[state]}</TableCell>
                  <TableCell sx={{ verticalAlign: "top" }}>
                    {people.length === 0 ? (
                      <Typography
                        variant="body2"
                        sx={{ color: "text.disabled", fontStyle: "italic" }}
                      >
                        nobody
                      </Typography>
                    ) : (
                      <Stack spacing={0.5}>
                        {people.map((recruit) => (
                          <Stack
                            key={recruit.id}
                            direction="row"
                            spacing={1}
                            sx={{ alignItems: "center" }}
                          >
                            <Typography variant="body2">{recruit.displayName}</Typography>
                            <StatusChip status={recruit.status} />
                          </Stack>
                        ))}
                      </Stack>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Paper>

      {/* -------------------------------------------------- The opt-out ------ */}
      <Box>
        <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700, mb: 1 }}>
          The opt-out surface
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Reached from a link at the foot of every message the club sends. Two taps, no login, no
          questions, and no attempt to talk them out of it.
        </Typography>

        <RecruitFrame url={`${domain}/stop/9f3c…`}>
          {optOutStep === "link" ? (
            <Stack spacing={3}>
              <Typography component="h1" sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 700 }}>
                Stop messages from the Oxford Lancers?
              </Typography>
              <Typography sx={{ fontSize: 15, color: "text.secondary" }}>
                {`We will stop messaging you about ${SEASON_LABEL} straight away. You stay welcome at any session, and nobody will ask you why.`}
              </Typography>
              <Button
                variant="contained"
                onClick={() => setOptOutStep("confirm")}
                sx={{ minHeight: 48 }}
              >
                Stop messaging me
              </Button>
              <Button variant="text" sx={{ minHeight: 48 }}>
                Keep them coming
              </Button>
            </Stack>
          ) : null}

          {optOutStep === "confirm" ? (
            <Stack spacing={3}>
              <Typography component="h1" sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 700 }}>
                Are you sure?
              </Typography>
              <Typography sx={{ fontSize: 15, color: "text.secondary" }}>
                This is the only confirmation. Pressing it stops everything — invitations,
                reminders, the lot — and there is nothing that will ask you again this season.
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <Button
                  variant="contained"
                  onClick={() => setOptOutStep("done")}
                  sx={{ minHeight: 48, flex: 1 }}
                >
                  Yes, stop them
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => setOptOutStep("link")}
                  sx={{ minHeight: 48, flex: 1 }}
                >
                  Go back
                </Button>
              </Stack>
            </Stack>
          ) : null}

          {optOutStep === "done" ? (
            <Stack spacing={3}>
              <Typography component="h1" sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 700 }}>
                Stopped
              </Typography>
              <Typography sx={{ fontSize: 15, color: "text.secondary" }}>
                {`We will not message you about ${SEASON_LABEL} again. If you change your mind, anybody at the club can point you back at the sign-up page.`}
              </Typography>
              <Button variant="text" onClick={() => setOptOutStep("link")} sx={{ minHeight: 48 }}>
                Start again
              </Button>
            </Stack>
          ) : null}
        </RecruitFrame>
      </Box>

      {/* -------------------------------------------- What the club sees ----- */}
      <Box>
        <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700, mb: 1 }}>
          What the club sees afterwards
        </Typography>
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
          <Stack spacing={2}>
            <Box component="ul" sx={{ m: 0, pl: 3 }}>
              <li>
                <strong>On their record</strong> — a banner at the top, the two send buttons
                disabled, and the dialog for the operator who pressed anyway. The fact is stated
                three times, in descending order of how hard it is to miss.
              </li>
              <li>
                <strong>Nothing is deleted.</strong> They stay on the board, at whatever rung they
                were on, with their whole history. Withdrawing consent is a messaging change, never
                a data loss, and erasure is Mission 8&rsquo;s and never recruitment&rsquo;s.
              </li>
              <li>
                <strong>Their status is untouched.</strong> Clementine Varrow withdrew and is{" "}
                <code>disengaged</code>; Ambrose Kittiwake refused and is <code>declined</code>.
                Those are two different facts and the product must not collapse them.
              </li>
              <li>
                <strong>Attendance still stands.</strong> They can turn up to anything and be
                recorded present. The status and the consent are what the club believes and what it
                may send, never a gate on the door.
              </li>
            </Box>
            <Alert severity="warning">
              <AlertTitle sx={{ fontWeight: 700 }}>
                The question underneath this, and it is Brian&rsquo;s.
              </AlertTitle>
              <code>declined</code> means they are not joining the club. A withdrawn consent means
              do not reach them on this channel — <em>they may still be interested</em>. The mission
              records only the first today, so a recruit who is keen but will not take WhatsApp
              messages has nowhere to be recorded, and one who declined the club is assumed to
              refuse contact too. They come apart in practice: &ldquo;not this term, ask me in
              Hilary&rdquo; is the never-harsh case and refuses no contact at all. The banner is
              built to carry either cause, so nothing has to change if the answer is that they are
              separate — but <strong>whether to record the second fact is unanswered.</strong>
            </Alert>
          </Stack>
        </Paper>
      </Box>

      <Scaffold title="Season scope, and what it costs">
        <Typography variant="body2" color="text.secondary">
          Consent granted for {SEASON_LABEL} carries from recruit through onboarding to player
          without being asked again. At the next season boundary it lapses and every one of these
          people is back at <strong>Never asked</strong> until they say yes again.
        </Typography>
      </Scaffold>
    </Stack>
  );
}
