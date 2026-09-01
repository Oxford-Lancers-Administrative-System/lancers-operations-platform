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
import { Aside, RecruitFrame, Scaffold } from "./chrome";
import { EVENTS, RECRUIT_LADDER, SIGN_UP_URL, TEMPLATES_APPROVED_IN_META } from "./fixtures";

/**
 * `W11` — the recruit's event flow after WhatsApp. **The whole path, on one
 * page.**
 *
 * This is the part that was painful last time and the ticket says not to
 * summarise it, so nothing here is described where it could be shown. Brian,
 * 2026-08-31, after two wrong attempts:
 *
 * > "They do see the page. They just see the yes page or the no page: yes,
 * > they're registered, or no, they're registered. It needs to go to the page
 * > like we have in the app. **There's no event page for them.** They don't
 * > click to go see the event. It's either yes or no, which is already in the
 * > app. It's built in the app already."
 *
 * So the journey has exactly three moments, and the middle one does not happen
 * in this product at all:
 *
 * 1. A WhatsApp message carrying the invitation and the two answers.
 * 2. They tap one **in WhatsApp**. There is no page between the tap and the
 *    answer being recorded.
 * 3. They land on **the shipped saved page** — `Your response is saved`, the
 *    answer and the event on one line, and `Change response`.
 *
 * `/rsvp/[token]`'s event view — venue, response deadline, current answer, the
 * two big buttons — is the **player's** screen and is shown below only for
 * contrast. A recruit is not asked to review an event; they were asked one
 * question and answered it in WhatsApp.
 *
 * ## A reason is never asked for, and the constraint still holds
 *
 * `rsvp_responses_no_requires_a_reason` makes a non-acceptance without a reason
 * unsubmittable — checked in the form, again on the server, and again by the
 * database. That is the domain's rule and **it is not weakened**. What changes
 * is who supplies it: for a recruit the system writes `No reason given` and the
 * reason step never runs. Attendance is not mandatory for somebody who is not a
 * member, so there is nothing to explain and nothing to chase.
 */

type Answer = "none" | "yes" | "no";

export default function EventFlow() {
  const [answer, setAnswer] = useState<Answer>("none");
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [showPlayerContrast, setShowPlayerContrast] = useState(false);
  const event = EVENTS[2];
  const domain = SIGN_UP_URL.split("/")[0];

  return (
    <Stack spacing={4}>
      <Box>
        <Typography variant="h6" component="h1">
          What a recruit sees after a recruitment event is approved
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Every state, in order, on one page. Tap an answer in the message below and follow it
          through.
        </Typography>
      </Box>

      {/* ------------------------------------------------------- 1. WhatsApp -- */}
      <Box>
        <StepHeading number={1} title="The invitation, as it arrives" />
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          This is WhatsApp, which this product does not render. It is drawn here because the whole
          flow is unreadable without it — the two answers are <em>in the message</em>, and the tap
          that records the answer happens before any page of ours is involved.
        </Typography>
        <WhatsAppThread
          eventName={event.name}
          startsAt={event.startsAt}
          venue={event.venue}
          answer={answer}
          followUp={showFollowUp}
          onAnswer={setAnswer}
        />
        <Stack direction="row" spacing={2} sx={{ mt: 2, flexWrap: "wrap", gap: 1 }}>
          <Button size="small" variant="outlined" onClick={() => setAnswer("none")}>
            Reset the thread
          </Button>
          <Button
            size="small"
            variant={showFollowUp ? "contained" : "outlined"}
            onClick={() => setShowFollowUp((on) => !on)}
          >
            Two days later, no answer
          </Button>
        </Stack>
        <Aside>
          The follow-up fires <strong>once</strong>, two days later, and only if there is no answer.
          Nothing follows it. A recruit is never escalated to the President, never chased about an
          unanswered event, and never sent a second reminder — which is why the recruits&rsquo;
          group on the messaging schedule has no President field at all, rather than a President
          field holding a discouraging number.
        </Aside>
      </Box>

      {/* ------------------------------------------------------- 2. Landing -- */}
      <Box>
        <StepHeading number={2} title="What they land on" />
        {answer === "none" ? (
          <Alert severity="info">
            Tap <strong>Yes</strong> or <strong>No</strong> in the message above. Nothing renders
            here until they do, because nothing in this product is reached until they do — there is
            no page between the tap and the answer being recorded.
          </Alert>
        ) : (
          <RecruitFrame url={`${domain}/rsvp/9f3c…?saved=1`}>
            <Stack spacing={3}>
              <Box>
                <Typography component="h1" sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 700 }}>
                  Your response is saved
                </Typography>
                <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 0.5 }}>
                  {`${answer === "yes" ? "Attending" : "Not attending"} · ${event.name} · ${event.startsAt}`}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
                You can change this answer until the event starts, including after the stated
                response deadline.
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <Button
                  variant="contained"
                  onClick={() => setAnswer(answer === "yes" ? "no" : "yes")}
                  sx={{ minHeight: 48, flex: 1 }}
                >
                  Change response
                </Button>
                <Button
                  variant="text"
                  sx={{ minHeight: 48, flex: 1 }}
                  onClick={() => setAnswer("none")}
                >
                  Close
                </Button>
              </Stack>
            </Stack>
          </RecruitFrame>
        )}
        <Aside>
          Both answers land on the same shipped page, and it is the whole of what a recruit sees.
          Note what is <strong>not</strong> here: no venue, no response deadline, no event
          description, no list of who else was invited or answered, and no way into anything else. A
          recruit sees an event&rsquo;s public details and nothing else — never attendance, never
          roster or member data.
        </Aside>
      </Box>

      {/* --------------------------------------------------- 3. The No path -- */}
      <Box>
        <StepHeading number={3} title="Answering no, without ever being asked why" />
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
          <Stack spacing={2}>
            <Typography variant="body2">
              A player answering No is taken to a second screen and made to type a reason before it
              will save. A recruit is not, and never is — there is no reason step in their path at
              all. Tap <strong>No</strong> above and count the screens: there is one, and it is the
              saved page.
            </Typography>
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small" sx={{ minWidth: 560 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }} />
                    <TableCell sx={{ fontWeight: 600 }}>A player</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>A recruit</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <ContrastRow
                    label="Where they answer"
                    player="On the RSVP page, after reviewing the event"
                    recruit="In WhatsApp. There is no event page for them."
                  />
                  <ContrastRow
                    label="Asked for a reason on No"
                    player="Yes — required, and refused without one"
                    recruit="Never"
                  />
                  <ContrastRow
                    label="Who supplies the reason"
                    player="They do"
                    recruit="The system writes “No reason given”"
                  />
                  <ContrastRow
                    label="What chases them"
                    player="A reminder every cadence, then the President"
                    recruit="One follow-up, then silence"
                  />
                  <ContrastRow
                    label="If they do not come"
                    player="It feeds the chase"
                    recruit="Nothing. It is not even a recruit status."
                  />
                </TableBody>
              </Table>
            </Box>
            <Alert severity="success">
              <AlertTitle sx={{ fontWeight: 700 }}>The constraint is not weakened.</AlertTitle>
              <code>rsvp_responses_no_requires_a_reason</code> still makes a non-acceptance without
              a reason unsubmittable — in the form, on the server, and in the database. The recruit
              path satisfies it by writing <em>No reason given</em> before the row is ever offered
              to the database. Attendance is not mandatory for somebody who is not a member, so
              there is nothing to explain and nothing to chase.
            </Alert>
            <Button
              variant="outlined"
              onClick={() => setShowPlayerContrast((on) => !on)}
              sx={{ alignSelf: "flex-start", minHeight: 44 }}
            >
              {showPlayerContrast
                ? "Hide the player's screen"
                : "Show the player's screen, for contrast"}
            </Button>
            {showPlayerContrast ? (
              <RecruitFrame url={`${domain}/rsvp/9f3c…?step=decline`}>
                <Stack spacing={3}>
                  <Box>
                    <Typography
                      component="h1"
                      sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 700 }}
                    >
                      Not attending
                    </Typography>
                    <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 0.5 }}>
                      {`${event.name} · ${event.startsAt}`}
                    </Typography>
                  </Box>
                  <Alert severity="info">Choose a reason before saving Not attending.</Alert>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      Reason — required
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ fontStyle: "italic", color: "text.disabled" }}
                    >
                      Academic conflict
                    </Typography>
                  </Paper>
                  <Typography sx={{ fontSize: 14, color: "text.secondary", fontStyle: "italic" }}>
                    A recruit never reaches this screen. It is a member obligation, and demanding
                    one of somebody who has not joined is the harshness this mission exists to keep
                    out.
                  </Typography>
                </Stack>
              </RecruitFrame>
            ) : null}
          </Stack>
        </Paper>
      </Box>

      {/* ---------------------------------------------- 4. Everything sent --- */}
      <Box>
        <StepHeading number={4} title="Everything the club ever sends a recruit" />
        <Paper variant="outlined" sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: 720 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Template</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Fires</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>They land on</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>In Meta</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {RECRUIT_LADDER.map((step) => {
                const struck = Boolean(step.withdrawn);
                return (
                  <TableRow key={step.template}>
                    <TableCell
                      sx={{
                        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                        textDecoration: struck ? "line-through" : "none",
                        color: struck ? "text.disabled" : "text.primary",
                      }}
                    >
                      {step.template}
                    </TableCell>
                    <TableCell sx={{ color: struck ? "text.disabled" : "text.primary" }}>
                      {struck ? step.withdrawn : step.fires}
                    </TableCell>
                    <TableCell sx={{ color: struck ? "text.disabled" : "text.primary" }}>
                      {struck ? "—" : step.lands}
                    </TableCell>
                    <TableCell>
                      {struck ? (
                        <Chip size="small" variant="outlined" label="Withdrawn" />
                      ) : TEMPLATES_APPROVED_IN_META.has(step.template) ? (
                        <Chip size="small" color="success" label="Approved" />
                      ) : (
                        <Chip
                          size="small"
                          color="warning"
                          variant="outlined"
                          label="Not submitted"
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Paper>
        <Alert severity="warning" sx={{ mt: 2 }}>
          <AlertTitle sx={{ fontWeight: 700 }}>Owner action, and externally timed.</AlertTitle>
          Only <code>event_invitation</code> exists in Meta today. The others have not been
          submitted, Meta review takes days to weeks and is outside the club&rsquo;s control, so
          this flow <strong>can be built and cannot run</strong> until Brian has loaded and cleared
          them. A template is created in Meta&rsquo;s own tooling; this product only names one when
          it sends, which is why there is no template screen anywhere.
        </Alert>
        <Aside>
          <strong>Never sent:</strong> anything at all to a recruit who declined; a second reminder;
          an escalation to the President; a chase for an unanswered event; free text of any kind. A
          QR recruit skips the welcome — they joined the group themselves at the stand.
        </Aside>
      </Box>

      <Scaffold title="What is drawn and what is photographed">
        <Typography variant="body2" color="text.secondary">
          The saved page is the shipped one — its heading, its second line, its note and its two
          buttons are `/rsvp/[token]`&rsquo;s own constants, which is why both answers look
          identical apart from one word. The WhatsApp thread is drawn, because WhatsApp is not ours
          to render.
        </Typography>
        <Aside>
          <strong>Later, and not drawn:</strong> Brian&rsquo;s own copy for the declined page —
          &ldquo;We&rsquo;ll miss seeing you. If you want to change, go back here.&rdquo; The
          shipped words stand until that flow is designed, so the No page above says exactly what
          the Yes page says.
        </Aside>
      </Scaffold>
    </Stack>
  );
}

function StepHeading({ number, title }: { number: number; title: string }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 1 }}>
      <Box
        sx={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          bgcolor: "primary.main",
          color: "common.white",
          display: "grid",
          placeItems: "center",
          fontSize: 13,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {number}
      </Box>
      <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
    </Stack>
  );
}

/**
 * The WhatsApp thread — drawn, and labelled as drawn.
 *
 * The club's side is a Meta-approved template, so it is rendered as fixed text
 * with no composer anywhere near it. There is no free text in either
 * direction, and there is no two-way chat: the recruit's only move is one of
 * the two buttons the template carries.
 */
function WhatsAppThread({
  eventName,
  startsAt,
  venue,
  answer,
  followUp,
  onAnswer,
}: {
  eventName: string;
  startsAt: string;
  venue: string;
  answer: Answer;
  followUp: boolean;
  onAnswer: (answer: Answer) => void;
}) {
  return (
    <Box
      sx={{
        maxWidth: 420,
        bgcolor: "#e6ddd4",
        border: "1px dashed",
        borderColor: "grey.500",
        borderRadius: 2,
        p: 2,
      }}
    >
      <Typography
        variant="overline"
        sx={{ fontWeight: 700, color: "text.secondary", display: "block", mb: 1 }}
      >
        WhatsApp · drawn, not ours to render
      </Typography>

      <Bubble>
        <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
          Oxford Lancers
        </Typography>
        <Typography variant="body2">
          {`Hi Rosalind — ${eventName} is on ${startsAt.replace(", ", " ")}, at ${venue}. Are you coming?`}
        </Typography>
        <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.5 }}>
          event_invitation · 12:00
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
          <Button
            size="small"
            variant={answer === "yes" ? "contained" : "outlined"}
            onClick={() => onAnswer("yes")}
            sx={{ flex: 1, minHeight: 40 }}
          >
            Yes
          </Button>
          <Button
            size="small"
            variant={answer === "no" ? "contained" : "outlined"}
            onClick={() => onAnswer("no")}
            sx={{ flex: 1, minHeight: 40 }}
          >
            No
          </Button>
        </Stack>
      </Bubble>

      {answer !== "none" ? (
        <Bubble mine>
          <Typography variant="body2">{answer === "yes" ? "Yes" : "No"}</Typography>
          <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.5 }}>
            12:04
          </Typography>
        </Bubble>
      ) : null}

      {followUp && answer === "none" ? (
        <Bubble>
          <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
            Oxford Lancers
          </Typography>
          <Typography variant="body2">
            {`Still hoping to see you at ${eventName}. No need to reply if it is not for you.`}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.5 }}>
            The event follow-up · two days later · 12:00
          </Typography>
        </Bubble>
      ) : null}

      {followUp && answer === "none" ? (
        <Typography variant="caption" sx={{ display: "block", mt: 1.5, fontStyle: "italic" }}>
          And then nothing. That is the end of the thread.
        </Typography>
      ) : null}
    </Box>
  );
}

function Bubble({ children, mine = false }: { children: React.ReactNode; mine?: boolean }) {
  return (
    <Box
      sx={{
        bgcolor: mine ? "#d9fdd3" : "background.paper",
        borderRadius: 2,
        p: 1.5,
        mb: 1,
        maxWidth: "88%",
        ml: mine ? "auto" : 0,
        boxShadow: 1,
      }}
    >
      {children}
    </Box>
  );
}

function ContrastRow({
  label,
  player,
  recruit,
}: {
  label: string;
  player: string;
  recruit: string;
}) {
  return (
    <TableRow>
      <TableCell sx={{ color: "text.secondary" }}>{label}</TableCell>
      <TableCell>{player}</TableCell>
      <TableCell sx={{ fontWeight: 600 }}>{recruit}</TableCell>
    </TableRow>
  );
}
