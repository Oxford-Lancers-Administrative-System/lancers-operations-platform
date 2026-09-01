"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { NotRecorded, Row, Scaffold, Section, StatusChip } from "./chrome";
import {
  CONSENT_LABELS,
  CONSENT_PERMITS_SENDING,
  EVENTS,
  OFF_BOARD_STATUSES,
  PROSPECT_STATUSES,
  SEASON_LABEL,
  STATUS_MEANING,
  type ProspectStatus,
  type Recruit,
} from "./fixtures";
import type { RecruitmentStore } from "./store";

/**
 * `W2` — one recruit's record, with `W2-04`'s refusal built into it.
 *
 * Every card here is a **shipped card from `/operate/roster/[membershipId]`
 * with its content replaced** — Brian, 2026-08-31: "The pages underneath
 * should be very similar to the roster in the way that it's done, except it's
 * the recruit player page, not the roster player page… We shouldn't invent UI
 * elements here."
 *
 * | Shipped card | Becomes |
 * | --- | --- |
 * | `PERSON`, slate | **Person**, unchanged, read-only, routing out |
 * | `ONBOARDING`, amber → teal | **Recruitment** |
 * | `SEASON`, blue | **Recruitment questionnaire** |
 * | `ATTENDANCE`, violet | **Recruitment events**, the shipped table, `Mandatory` dropped |
 * | `THEIR OTHER SEASONS`, slate | **Notes** |
 * | `STATUS HISTORY`, slate | **Status history** |
 *
 * The events card matters most: it already ships as a table of `Event · Date ·
 * Mandatory · RSVP · Attendance · Event status`, which is the exact treatment
 * Brian approved for the board the same day, so it is reused whole rather than
 * rebuilt. `Mandatory` goes because a recruit has no mandatory events.
 *
 * **The flip is not a button here**, and neither is the exit. Both are status
 * changes, and the status control is the one on this page.
 */
export default function RecruitRecord({
  recruit,
  store,
  onBack,
}: {
  recruit: Recruit;
  store: RecruitmentStore;
  onBack: () => void;
}) {
  const [dialog, setDialog] = useState<"A" | "B" | "refused" | null>(null);
  const [draftNote, setDraftNote] = useState("");
  const [editingStatus, setEditingStatus] = useState(false);
  const [pending, setPending] = useState<{ status: ProspectStatus; reason: string } | null>(null);

  /**
   * Showing up, not being written down.
   *
   * This counted every attendance record, which made Rosalind — whose only
   * record is `Absent` at the Freshers' Fair — read as having attended one
   * event. The approved `W2-01` frame shows `1` for exactly that reason. Absent
   * is a record of *not* turning up, and `Excused` is a record of an agreed
   * absence, so neither belongs in a count labelled attended.
   */
  const eventsAttended = recruit.events.filter(
    (entry) => entry.attendance === "present" || entry.attendance === "late",
  ).length;

  /**
   * One derived question — **may the club message this person?** — with the
   * reason named underneath.
   *
   * Two different facts can answer it No, and `W2` records that they may come
   * apart in practice: `declined` means they are not joining the club, while a
   * withdrawn or refused consent means do not reach them on this channel — they
   * may still be interested. "Not this term, ask me in Hilary" is the
   * never-harsh case and refuses no contact at all. The banner is built to
   * carry either cause so that nothing here has to change if Brian settles that
   * they are separate; **whether to record the second fact is his, and
   * unanswered.**
   */
  const refusal =
    recruit.status === "declined"
      ? {
          headline: `The club will not message ${recruit.givenName}.`,
          because: `He declined on ${recruit.exitReason ? "2 May 2026" : "the date on their record"}. Change his recruitment status if that is wrong.`,
        }
      : !CONSENT_PERMITS_SENDING[recruit.consent]
        ? {
            headline: `The club will not message ${recruit.givenName}.`,
            because:
              recruit.consent === "withdrawn"
                ? `Consent was withdrawn on ${recruit.consentOn ?? "an earlier date"}, for season ${SEASON_LABEL}. They may still be interested — this is a channel refusal, not a decision about the club.`
                : "No consent has been recorded for this season. Consent is collected on the sign-up form and nowhere else.",
          }
        : null;

  const sendingBlocked = refusal !== null;

  function commitStatus(next: ProspectStatus) {
    setEditingStatus(false);
    if (next === recruit.status) return;
    if (OFF_BOARD_STATUSES.has(next)) {
      setPending({ status: next, reason: "" });
      return;
    }
    store.setStatus(recruit.id, next, null);
  }

  return (
    <Stack spacing={3}>
      {/* The headline, and the two send buttons — `W2`'s own top-right pair. */}
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        sx={{ justifyContent: "space-between", alignItems: { md: "flex-start" } }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 800 }}>
            {recruit.displayName}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {`Recruitment · ${SEASON_LABEL} · opened from the recruit board`}
          </Typography>
        </Box>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ flexShrink: 0 }}>
          <Button
            variant="contained"
            disabled={sendingBlocked}
            onClick={() => setDialog(sendingBlocked ? "refused" : "A")}
            sx={{ minHeight: 44 }}
          >
            Send personal questionnaire
          </Button>
          <Button
            variant="contained"
            disabled={sendingBlocked}
            onClick={() => setDialog(sendingBlocked ? "refused" : "B")}
            sx={{ minHeight: 44 }}
          >
            Send recruitment questionnaire
          </Button>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={4} sx={{ flexWrap: "wrap", gap: 3 }}>
        <Headline
          value={<StatusChip status={recruit.status} size="medium" />}
          label="Recruitment status"
        />
        <Headline value={recruit.firstContactOn} label="First contact" />
        <Headline value={String(eventsAttended)} label="Events attended" />
        <Headline value={CONSENT_LABELS[recruit.consent]} label={`Consent · ${SEASON_LABEL}`} />
      </Stack>

      <Section band="person" title="Person">
        <Row label="Name">
          <Typography variant="body2">{recruit.displayName}</Typography>
        </Row>
        <Row label="Aliases">
          {recruit.aliases.length === 0 ? (
            <NotRecorded />
          ) : (
            <Typography variant="body2">{recruit.aliases.join(", ")}</Typography>
          )}
        </Row>
        <Row label="Mobile phone">
          {recruit.mobile ? (
            <Typography variant="body2">{recruit.mobile}</Typography>
          ) : (
            <NotRecorded />
          )}
        </Row>
        <Row label="Personal email">
          {recruit.email ? (
            <Typography variant="body2">{recruit.email}</Typography>
          ) : (
            <NotRecorded />
          )}
        </Row>
        <Row label="College">
          {recruit.college ? (
            <Typography variant="body2">{recruit.college}</Typography>
          ) : (
            <NotRecorded />
          )}
        </Row>
        <Row label="Matriculation year">
          {recruit.matriculationYear ? (
            <Typography variant="body2">{recruit.matriculationYear}</Typography>
          ) : (
            <NotRecorded />
          )}
        </Row>
        <Row label="Expected graduation">
          {recruit.expectedGraduationYear ? (
            <Typography variant="body2">{recruit.expectedGraduationYear}</Typography>
          ) : (
            <NotRecorded />
          )}
        </Row>
        <Row label="Degree field">
          {recruit.degreeField ? (
            <Typography variant="body2">{recruit.degreeField}</Typography>
          ) : (
            <NotRecorded />
          )}
        </Row>
        {/*
          The send sits with the questions it asked — Brian, 2026-09-01: "The
          personnel questions sent should be with the personnel questions."
          Its twin is on the RECRUITMENT card below, beside the six answers it
          collects.

          There is no `Preferred name` row and no `Year` row. The first was
          invented by this mockup — `main` has `person_aliases` and no
          preferred-name field, so what the questionnaire collects writes to
          `Aliases` above. The second said the same thing as Matriculation year.
        */}
        <Row label="Personal questionnaire sent" note={sentNote(recruit.questionnaireASentOn)}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {recruit.questionnaireASentOn.length > 0 ? "Yes" : "No"}
          </Typography>
        </Row>
      </Section>

      <Section band="recruitment" title="Recruitment">
        <Row label="Status">
          {editingStatus ? (
            <Select
              size="small"
              open
              autoFocus
              value={recruit.status}
              onClose={() => setEditingStatus(false)}
              onChange={(event) => commitStatus(event.target.value as ProspectStatus)}
              sx={{ minWidth: 240 }}
            >
              {PROSPECT_STATUSES.map((option) => (
                <MenuItem key={option} value={option}>
                  <Stack>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {option}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {STATUS_MEANING[option]}
                    </Typography>
                  </Stack>
                </MenuItem>
              ))}
            </Select>
          ) : (
            <Box
              component="button"
              type="button"
              onClick={() => setEditingStatus(true)}
              sx={{ border: "none", bgcolor: "transparent", p: 0, cursor: "pointer" }}
            >
              <StatusChip status={recruit.status} />
            </Box>
          )}
        </Row>
        <Row label="Came in through">
          <Typography variant="body2">{recruit.source}</Typography>
        </Row>
        <Row label="First contact">
          <Typography variant="body2">{recruit.firstContactOn}</Typography>
        </Row>
        <Row label="Committed on">
          {recruit.committedOn ? (
            <Typography variant="body2">{recruit.committedOn}</Typography>
          ) : (
            <NotRecorded />
          )}
        </Row>
        <Row label={`Consent · ${SEASON_LABEL}`}>
          <Typography variant="body2">
            {CONSENT_LABELS[recruit.consent]}
            {recruit.consentOn ? ` · ${recruit.consentOn}` : ""}
          </Typography>
        </Row>
        {recruit.exitReason ? (
          <Row label="Reason recorded">
            <Typography variant="body2">{recruit.exitReason}</Typography>
          </Row>
        ) : null}

        {/*
          The six recruitment answers, in this card and not a second one —
          Brian, 2026-09-01: "Recruitment and recruitment questions are one
          thing." The separate blue RECRUITMENT QUESTIONNAIRE card is gone.
        */}
        <Row label="Played American football before?">
          <Answered value={recruit.questionnaireBAnswers?.playedBefore ?? null} />
        </Row>
        <Row label="Watched American football before?">
          <Answered value={recruit.questionnaireBAnswers?.watchedBefore ?? null} />
        </Row>
        <Row label="Position interest">
          <Answered value={recruit.questionnaireBAnswers?.positionInterest ?? null} />
        </Row>
        <Row label="Gear owned">
          <Answered value={recruit.questionnaireBAnswers?.gearOwned ?? null} />
        </Row>
        <Row label="How they heard of us">
          <Answered value={recruit.questionnaireBAnswers?.heardVia ?? null} />
        </Row>
        <Row label="Anything else">
          <Answered value={recruit.questionnaireBAnswers?.anythingElse ?? null} />
        </Row>
        <Row label="Recruitment questionnaire sent" note={sentNote(recruit.questionnaireBSentOn)}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {recruit.questionnaireBSentOn.length > 0 ? "Yes" : "No"}
          </Typography>
        </Row>
      </Section>

      {/*
        The shipped attendance table, reused whole. `Mandatory` is dropped —
        a recruit has no mandatory events — and the two facts render as plain
        text in their own columns, which is exactly how the board renders them.
      */}
      <Section band="attendance" title="Recruitment events">
        {/* Scrolls inside its own container at 375px rather than losing its
            last two columns to the card's edge. */}
        <Box sx={{ overflowX: "auto", mx: -1, px: 1 }}>
          <Table size="small" sx={{ minWidth: 560 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Event</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>RSVP</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Attendance</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Event status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {EVENTS.map((event) => {
                const entry = recruit.events.find((row) => row.eventId === event.id);
                return (
                  <TableRow key={event.id}>
                    <TableCell>{event.name}</TableCell>
                    <TableCell>{event.date}</TableCell>
                    <TableCell>
                      <Plain value={entry?.rsvp ? (entry.rsvp === "yes" ? "Yes" : "No") : null} />
                    </TableCell>
                    <TableCell>
                      <Plain
                        value={
                          entry?.attendance
                            ? entry.attendance.charAt(0).toUpperCase() + entry.attendance.slice(1)
                            : null
                        }
                      />
                    </TableCell>
                    <TableCell>{event.status}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      </Section>

      <Section band="person" title="Notes">
        <Stack spacing={2} sx={{ py: 1.5 }}>
          {recruit.notes.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Nothing written down yet.
            </Typography>
          ) : (
            recruit.notes.map((entry, index) => (
              <Box key={`${entry.at}-${index}`}>
                <Typography variant="body2">{entry.body}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {`${entry.author} · ${entry.at}`}
                </Typography>
              </Box>
            ))
          )}
          <TextField
            size="small"
            placeholder="Add a note…"
            value={draftNote}
            onChange={(event) => setDraftNote(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && draftNote.trim() !== "") {
                store.addNote(recruit.id, draftNote.trim());
                setDraftNote("");
              }
            }}
            fullWidth
            helperText="Prose, attributed and dated. Never scored, never ranked, never shown to a coach or the recruit."
          />
        </Stack>
      </Section>

      <Section band="person" title="Status history">
        <Stack spacing={1.5} sx={{ py: 1.5 }}>
          {recruit.audit.map((entry, index) => (
            <Box key={`${entry.detail}-${index}`}>
              <Typography variant="body2">{entry.summary}</Typography>
              <Typography variant="caption" color="text.secondary">
                {entry.detail}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Section>

      <Box>
        <Button variant="contained" onClick={onBack} sx={{ minHeight: 44 }}>
          Back to recruitment
        </Button>
      </Box>

      <Scaffold title="Consent, moved by hand">
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          The five states, on this record. In the product these move when the recruit acts — the
          sign-up form, or the opt-out link. Here they move because you pressed something.
        </Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
          {(Object.keys(CONSENT_LABELS) as (keyof typeof CONSENT_LABELS)[]).map((state) => (
            <Button
              key={state}
              size="small"
              variant={recruit.consent === state ? "contained" : "outlined"}
              onClick={() =>
                store.setConsent(recruit.id, state, state === "never_asked" ? null : "14 May 2026")
              }
            >
              {CONSENT_LABELS[state]}
            </Button>
          ))}
        </Stack>
      </Scaffold>

      {dialog === "A" || dialog === "B" ? (
        <SendDialog
          recruit={recruit}
          which={dialog}
          onCancel={() => setDialog(null)}
          onSend={() => {
            store.markQuestionnaireSent(recruit.id, dialog);
            setDialog(null);
          }}
        />
      ) : null}

      {dialog === "refused" && refusal ? (
        <Dialog open onClose={() => setDialog(null)} maxWidth="sm" fullWidth>
          <DialogTitle
            sx={{ fontWeight: 700 }}
          >{`${recruit.givenName} has asked not to be contacted`}</DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ mb: 2 }}>
              {refusal.because}
            </Typography>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="overline" sx={{ fontWeight: 700, color: "text.secondary" }}>
                Already sent
              </Typography>
              {recruit.questionnaireASentOn.length === 0 &&
              recruit.questionnaireBSentOn.length === 0 ? (
                <Typography variant="body2">Nothing.</Typography>
              ) : (
                [...recruit.questionnaireASentOn, ...recruit.questionnaireBSentOn].map((date) => (
                  <Typography key={date} variant="body2">
                    {date}
                  </Typography>
                ))
              )}
              <Typography variant="body2" sx={{ color: "#b26a00", fontWeight: 600, mt: 1 }}>
                Change the status or the consent if that is wrong. Nothing else here will send.
              </Typography>
            </Paper>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialog(null)}>Cancel</Button>
          </DialogActions>
        </Dialog>
      ) : null}

      {pending ? (
        <Dialog open onClose={() => setPending(null)} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ fontWeight: 700 }}>
            {pending.status === "joined"
              ? `Add ${recruit.displayName} to ${SEASON_LABEL}?`
              : `Take ${recruit.givenName} off the board as ${pending.status}?`}
          </DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ mb: 2 }}>
              {STATUS_MEANING[pending.status]}
            </Typography>
            {pending.status === "joined" ? (
              <Typography variant="body2" color="text.secondary">
                Creates a season membership for {SEASON_LABEL}, puts them on the roster as joined
                and opens onboarding. It does not make them active — that is a separate later step.
              </Typography>
            ) : pending.status === "declined" ? (
              <Typography variant="body2" color="text.secondary">
                No reason is asked for. Their record, their history and their attendance all stay
                exactly as they are.
              </Typography>
            ) : (
              <TextField
                label={pending.status === "void" ? "Reason (required)" : "Reason (recommended)"}
                value={pending.reason}
                onChange={(event) => setPending({ ...pending, reason: event.target.value })}
                fullWidth
                multiline
                minRows={2}
              />
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPending(null)}>Cancel</Button>
            <Button
              variant="contained"
              disabled={pending.status === "void" && pending.reason.trim() === ""}
              onClick={() => {
                store.setStatus(recruit.id, pending.status, pending.reason.trim() || null);
                setPending(null);
              }}
              sx={{ minHeight: 44 }}
            >
              {pending.status === "joined" ? "Add to the season" : `Set ${pending.status}`}
            </Button>
          </DialogActions>
        </Dialog>
      ) : null}
    </Stack>
  );
}

/**
 * The dialog confirms the one questionnaire its button chose — which is why it
 * never has to ask which one — and shows **when it was last sent**, because
 * the point is not bothering somebody twice.
 */
function SendDialog({
  recruit,
  which,
  onCancel,
  onSend,
}: {
  recruit: Recruit;
  which: "A" | "B";
  onCancel: () => void;
  onSend: () => void;
}) {
  const isA = which === "A";
  const dates = isA ? recruit.questionnaireASentOn : recruit.questionnaireBSentOn;
  const answered = isA
    ? recruit.questionnaireAAnswers !== null
    : recruit.questionnaireBAnswers !== null;
  return (
    <Dialog open onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>
        {isA ? "Send the personal details questionnaire?" : "Send the recruitment questionnaire?"}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          {`One approved WhatsApp template goes to ${recruit.givenName}, carrying a signed link that acts as them and exposes nothing but their own form.`}
        </Typography>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="overline" sx={{ fontWeight: 700, color: "text.secondary" }}>
            Last sent
          </Typography>
          {dates.length === 0 ? (
            <Typography variant="body2">Never.</Typography>
          ) : (
            dates.map((date) => (
              <Typography key={date} variant="body2">
                {date}
              </Typography>
            ))
          )}
          {answered ? (
            <Typography variant="body2" sx={{ fontWeight: 600, mt: 1 }}>
              Already answered. Sending again replaces nothing — the later answer supersedes and the
              earlier one is kept.
            </Typography>
          ) : null}
        </Paper>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" onClick={onSend} sx={{ minHeight: 44 }}>
          Send
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function Headline({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <Box>
      {typeof value === "string" ? (
        <Typography variant="h6" component="div" sx={{ fontWeight: 700 }}>
          {value}
        </Typography>
      ) : (
        value
      )}
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
        {label}
      </Typography>
    </Box>
  );
}

function Answered({ value }: { value: string | null }) {
  return value === null ? (
    <NotRecorded word="not answered" />
  ) : (
    <Typography variant="body2">{value}</Typography>
  );
}

/** The dates a questionnaire went out, under the Yes or No it produced. */
function sentNote(dates: readonly string[]): string {
  if (dates.length === 0) return "Never sent.";
  if (dates.length === 1) return `Sent ${dates[0]}.`;
  return `Sent ${dates.join(", ")}.`;
}

function Plain({ value }: { value: string | null }) {
  return value === null ? (
    <Typography variant="body2" sx={{ color: "text.disabled", fontStyle: "italic" }}>
      Not recorded
    </Typography>
  ) : (
    <Typography variant="body2">{value}</Typography>
  );
}
