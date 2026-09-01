"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { Aside, Scaffold } from "./chrome";
import {
  ATTENDANCE_COLOUR,
  ATTENDANCE_LABEL,
  EVENTS,
  type Attendance,
  type Recruit,
  SHEET_PLAYERS,
  type SheetPlayer,
} from "./fixtures";
import type { RecruitmentStore } from "./store";

/**
 * The shipped attendance sheet — `W5` and `W12` both live on it, and neither
 * changes it.
 *
 * Route: `/operate/events/[id]/attendance`, unchanged. Everything below is the
 * real sheet's own behaviour, copied: four one-touch states with immediate save
 * and no Submit, the not-recorded state that never becomes Absent, the RSVP
 * shown for context with its prefix so intent is never read as observation, the
 * disclosure groups, and the walk-up capture path.
 *
 * **`W12`'s one change** is that invited recruits appear on it at all, and that
 * they appear as their own group at the top. The shipped sheet derives its
 * roster from memberships, so a recruit is not on it — that is the gap Task 09
 * § 9.1 names, and it is what this workflow builds. The group markup is the
 * sheet's own: the same chevron, the same heading and detail, the same count
 * chip on the right.
 *
 * ## Two words a coach never sees
 *
 * A recruit on this sheet is shown **by name only**. Their funnel status is not
 * on it — "a coach reading 'declined' beside somebody standing in front of them
 * is both a privacy leak and a bad afternoon" — and neither is a contact value,
 * an RSVP reason, or a note.
 */

/** `walk-up`, everywhere. Brian settled the word on 2026-08-31. */
export const WALK_UP_HEADLINE = "Add a walk-up";
export const WALK_UP_SUBMIT = "Add walk-up";
export const WALK_UP_CHIP = "Walk-up · in recruitment";
export const ADD_WALK_UP = "Add walk-up";

/**
 * The shipped form's own alert, with the one sentence the consent model
 * changes.
 *
 * The shipped copy already says what this creates — that claim was checked
 * against the running page and the specification corrected. What the form still
 * does not say is that saving **sends that person a message**, which is the
 * part an operator most needs to know. Under the consent model that message is
 * the sign-up form, not a welcome, and it is the only one that goes out before
 * consent comes back.
 */
export const WALK_UP_RECONCILIATION_NOTE =
  "They are added to recruitment as somebody to follow up, and recorded at this event. " +
  "This does not put them on the roster or create a membership.";

export const WALK_UP_SEND_NOTE =
  "Saving sends them one WhatsApp message: the sign-up form, prefilled, on a link that is theirs. " +
  "Read the number back before you save.";

export const WALK_UP_ALWAYS_PRESENT =
  "Recorded as Present. Correct it on their row afterwards if you need to.";

type Row =
  | {
      kind: "recruit";
      key: string;
      name: string;
      rsvp: Recruit["events"][number]["rsvp"];
      attendance: Attendance;
      isWalkUp: boolean;
    }
  | {
      kind: "player";
      key: string;
      name: string;
      rsvp: SheetPlayer["rsvp"];
      attendance: Attendance;
    };

export default function AttendanceSheet({
  store,
  eventId,
  openCaptureFirst,
}: {
  store: RecruitmentStore;
  eventId: string;
  /** `W5` opens with the capture form up; `W12` opens on the sheet. */
  openCaptureFirst: boolean;
}) {
  const event = EVENTS.find((entry) => entry.id === eventId) ?? EVENTS[0];
  const [capturing, setCapturing] = useState(openCaptureFirst);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState({ recruits: true, everyone: true, walkUps: true });
  const [players, setPlayers] = useState<readonly SheetPlayer[]>(SHEET_PLAYERS);
  const [walkUps, setWalkUps] = useState<readonly string[]>([]);

  const needle = search.trim().toLowerCase();
  const matches = (name: string) => needle === "" || name.toLowerCase().includes(needle);

  const invitedRecruits: Row[] = store.recruits
    .filter((recruit) => recruit.events.some((entry) => entry.eventId === eventId))
    .filter((recruit) => !walkUps.includes(recruit.id))
    .filter((recruit) => matches(recruit.displayName))
    .map((recruit) => {
      const entry = recruit.events.find((row) => row.eventId === eventId);
      return {
        kind: "recruit" as const,
        key: recruit.id,
        name: recruit.displayName,
        rsvp: entry?.rsvp ?? null,
        attendance: entry?.attendance ?? null,
        isWalkUp: false,
      };
    });

  const walkUpRows: Row[] = store.recruits
    .filter((recruit) => walkUps.includes(recruit.id))
    .filter((recruit) => matches(recruit.displayName))
    .map((recruit) => {
      const entry = recruit.events.find((row) => row.eventId === eventId);
      return {
        kind: "recruit" as const,
        key: recruit.id,
        name: recruit.displayName,
        rsvp: null,
        attendance: entry?.attendance ?? null,
        isWalkUp: true,
      };
    });

  const playerRows: Row[] = players
    .filter((player) => matches(player.displayName))
    .map((player) => ({
      kind: "player" as const,
      key: player.key,
      name: player.displayName,
      rsvp: player.rsvp,
      attendance: player.attendance,
    }));

  function setRowAttendance(row: Row, attendance: Attendance) {
    if (row.kind === "recruit") {
      store.setAttendance(row.key, eventId, attendance);
      return;
    }
    setPlayers((prev) =>
      prev.map((player) => (player.key === row.key ? { ...player, attendance } : player)),
    );
  }

  const showed = [...invitedRecruits, ...walkUpRows, ...playerRows].filter(
    (row) => row.attendance !== null && row.attendance !== "absent",
  ).length;
  const invited = invitedRecruits.length + playerRows.length;

  if (capturing) {
    return (
      <WalkUpForm
        eventName={event.name}
        onCancel={() => setCapturing(false)}
        onSave={(displayName) => {
          const [givenName, ...rest] = displayName.split(" ");
          const id = `p-walkup-${Date.now()}`;
          store.addRecruit({
            id,
            personId: `person-${id}`,
            givenName,
            familyName: rest.join(" "),
            displayName,
            aliases: [],
            college: null,
            matriculationYear: null,
            expectedGraduationYear: null,
            degreeField: null,
            mobile: "07700 900102",
            email: null,
            status: "identified",
            source: `Walk-up · ${event.name}`,
            firstContactOn: "14 May 2026",
            committedOn: null,
            exitReason: null,
            notes: [],
            consent: "asked",
            consentOn: null,
            questionnaireASentOn: ["14 May 2026"],
            questionnaireAAnswers: null,
            questionnaireBSentOn: [],
            questionnaireBAnswers: null,
            events: [{ eventId, rsvp: null, attendance: "present" }],
            audit: [
              {
                summary: "Sign-up form sent · WhatsApp template",
                detail: "14 May 2026 · queued",
              },
              {
                summary: `Added as identified · walk-up at ${event.name}`,
                detail: "14 May 2026 · Caspian Hallowfield",
              },
            ],
          });
          setWalkUps((prev) => [...prev, id]);
          setJustAdded(displayName);
          setCapturing(false);
        }}
      />
    );
  }

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ justifyContent: "space-between", alignItems: { sm: "flex-start" } }}
      >
        <Box>
          <Typography variant="h6" component="h1">
            {`Attendance · ${event.name}`}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {`${event.startsAt} · ${event.venue}`}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Record who was there, and correct it whenever you need to.
          </Typography>
        </Box>
        <Button variant="contained" onClick={() => setCapturing(true)} sx={{ minHeight: 44 }}>
          {ADD_WALK_UP}
        </Button>
      </Stack>

      <Stack direction="row" spacing={4} sx={{ flexWrap: "wrap", gap: 3 }}>
        <Headline value={String(invited)} label="Invited" />
        <Headline
          value={String(
            [...invitedRecruits, ...playerRows].filter((row) => row.rsvp === "yes").length,
          )}
          label="Said yes"
        />
        <Headline value={`${showed} / ${invited}`} label="Showed" />
      </Stack>

      <Typography variant="body2" color="text.secondary">
        RSVP and attendance remain separate. Mismatches are visible and never auto-reconciled.
      </Typography>

      {/*
        The green line, shrunk. Brian: "I don't like the extra text. I think a
        smaller text box that says 'Walkup added' is perfectly fine, as long as
        it disappears if multiple walkups get added." It is about the last add;
        the Walk-ups section below carries the record.
      */}
      {justAdded ? (
        <Alert severity="success" onClose={() => setJustAdded(null)} sx={{ py: 0 }}>
          Walk-up added
        </Alert>
      ) : null}

      <TextField
        size="small"
        label="Search this sheet"
        value={search}
        onChange={(event_) => setSearch(event_.target.value)}
        sx={{ maxWidth: 360 }}
      />

      <Stack spacing={2}>
        {/*
          Recruits at the top — Task 09 D11, and the one thing `W12` changes
          about this screen. Everyone else below.
        */}
        <Group
          label="Recruits"
          detail="Invited from their recruitment record, not from a membership"
          count={invitedRecruits.length}
          open={open.recruits}
          onToggle={() => setOpen((prev) => ({ ...prev, recruits: !prev.recruits }))}
          rows={invitedRecruits}
          onSet={setRowAttendance}
        />
        <Group
          label="Everyone else"
          detail="Players on this season's roster"
          count={playerRows.length}
          open={open.everyone}
          onToggle={() => setOpen((prev) => ({ ...prev, everyone: !prev.everyone }))}
          rows={playerRows}
          onSet={setRowAttendance}
        />
        <Group
          label="Walk-ups"
          detail="Turned up uninvited, recorded present, to reconcile"
          count={walkUpRows.length}
          open={open.walkUps}
          onToggle={() => setOpen((prev) => ({ ...prev, walkUps: !prev.walkUps }))}
          rows={walkUpRows}
          onSet={setRowAttendance}
        />
      </Stack>

      <Scaffold title="What this sheet does and does not do">
        <Box component="ul" sx={{ m: 0, pl: 3, color: "text.secondary" }}>
          <li>
            A recruit who <strong>does not turn up</strong> feeds nothing. &ldquo;Did not show
            up&rdquo; is deliberately not a recruit status and triggers no chase — a player who
            misses has an obligation they did not meet; a recruit has told the club something mild.
          </li>
          <li>
            Attendance recorded moves <code>identified → engaged</code>. Mark a recruit present
            above and watch their rung change on the board. Attendance <em>not</em> recorded moves
            nothing and means nothing — it never becomes Absent on its own.
          </li>
          <li>Turnout is the sum of the records. There is no separate headcount box anywhere.</li>
          <li>
            A coach taking this sheet sees exactly what is on it: names, standing RSVP and the four
            states. No contact values, no RSVP reasons, no recruitment status, no notes, no board.
          </li>
        </Box>
      </Scaffold>
    </Stack>
  );
}

/**
 * The walk-up form — the shipped one, with nothing added to it except the
 * sentence about what saving sends.
 *
 * `W5` cut a proposed read-back *screen*, a duplicate-check screen and a
 * refusal screen: "It should just be the normal workflow." The read-back
 * survives as what it always was — a line on the form telling the operator to
 * say the number out loud before pressing save, because save sends a business
 * message to a real phone.
 *
 * **This door runs no duplicate check, deliberately.** A walk-up is written on
 * a phone at the side of a pitch, where a check would be an interruption; a
 * duplicate is reconciliation's problem, which is what the prospect record
 * exists for. Brian removed the roster-match path himself — "they know who's on
 * their roster, there are only 40 people". The condition he attached to `W5`'s
 * approval, that this check match the operator-add door's, is therefore **not
 * currently true**, and making it true would reverse his own decision. It needs
 * his word either way.
 */
function WalkUpForm({
  eventName,
  onCancel,
  onSave,
}: {
  eventName: string;
  onCancel: () => void;
  onSave: (displayName: string) => void;
}) {
  const [given, setGiven] = useState("Marguerite");
  const [family, setFamily] = useState("Fennimore");
  const [phone, setPhone] = useState("07700 900102");
  const [email, setEmail] = useState("");

  const ready = given.trim() !== "" && family.trim() !== "" && phone.trim() !== "";

  return (
    <Box sx={{ maxWidth: 560 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            {WALK_UP_HEADLINE}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Somebody who turned up and is not on the roster.
          </Typography>
        </Box>

        <Alert severity="warning">
          <Typography variant="body2">{WALK_UP_RECONCILIATION_NOTE}</Typography>
        </Alert>

        <Alert severity="info">
          <Typography variant="body2">{WALK_UP_SEND_NOTE}</Typography>
        </Alert>

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
          label="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          fullWidth
          helperText="How the club follows them up. Stored exactly as it was given."
        />
        <TextField
          label="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          fullWidth
          helperText="Optional. Stored exactly as it was given."
        />

        <Typography variant="body2" color="text.secondary">
          {WALK_UP_ALWAYS_PRESENT}
        </Typography>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <Button
            variant="contained"
            disabled={!ready}
            onClick={() => onSave(`${given.trim()} ${family.trim()}`)}
            sx={{ minHeight: 44 }}
          >
            {WALK_UP_SUBMIT}
          </Button>
          <Button variant="outlined" onClick={onCancel} sx={{ minHeight: 44 }}>
            Cancel
          </Button>
        </Stack>

        <Aside>
          {`Saving does four things at once, from the operator's point of view one: the person is minted, a recruit record is opened at identified, they are recorded present at ${eventName}, and the sign-up form goes out. No mobile means no capture — an owner-accepted limitation, stated knowingly: "a walk-up we can't reach isn't in the pipeline."`}
        </Aside>
      </Stack>
    </Box>
  );
}

function Group({
  label,
  detail,
  count,
  open,
  onToggle,
  rows,
  onSet,
}: {
  label: string;
  detail: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  rows: readonly Row[];
  onSet: (row: Row, attendance: Attendance) => void;
}) {
  // A group with nobody in it is not rendered at all — the sheet's own rule.
  if (count === 0) return null;
  return (
    <Box>
      <ButtonBase
        onClick={onToggle}
        aria-expanded={open}
        sx={{
          width: "100%",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: 1.5,
          px: 1,
          py: 1.5,
          minHeight: 44,
          borderRadius: 1,
          textAlign: "left",
        }}
      >
        <Box
          aria-hidden
          component="svg"
          viewBox="0 0 24 24"
          sx={{
            flexShrink: 0,
            width: 22,
            height: 22,
            color: "text.primary",
            transition: (theme) => theme.transitions.create("transform"),
            transform: open ? "rotate(90deg)" : "none",
          }}
        >
          <path
            d="M9 5l7 7-7 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>
            {label}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {detail}
          </Typography>
        </Box>
        <Chip size="small" label={count} sx={{ ml: "auto" }} />
      </ButtonBase>

      <Collapse in={open} unmountOnExit>
        <Box component="ul" sx={{ listStyle: "none", p: 0, m: 0 }}>
          {rows.map((row) => (
            <SheetRow key={row.key} row={row} onSet={(attendance) => onSet(row, attendance)} />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

const PRESENCES: readonly NonNullable<Attendance>[] = ["present", "late", "excused", "absent"];

function SheetRow({ row, onSet }: { row: Row; onSet: (attendance: Attendance) => void }) {
  return (
    <Box
      component="li"
      sx={{
        listStyle: "none",
        py: 2,
        borderBottom: 1,
        borderColor: "divider",
        display: "grid",
        gap: 1.5,
        gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) minmax(0, 2fr)" },
        alignItems: "center",
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body1" sx={{ fontWeight: 600 }}>
          {row.name}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {row.kind === "recruit" && row.isWalkUp
            ? "Walk-up · never invited"
            : row.rsvp === "yes"
              ? "RSVP: Attending"
              : row.rsvp === "no"
                ? "RSVP: Not attending"
                : "RSVP: No response"}
        </Typography>
        {row.kind === "recruit" && row.isWalkUp ? (
          <Chip size="small" color="warning" label={WALK_UP_CHIP} sx={{ mt: 0.5 }} />
        ) : null}
      </Box>

      <Stack spacing={1}>
        <Box
          role="group"
          aria-label={`Attendance for ${row.name}`}
          sx={{
            display: "grid",
            gap: 1,
            gridTemplateColumns: {
              xs: "repeat(2, minmax(0, 1fr))",
              md: "repeat(4, minmax(0, 1fr))",
            },
          }}
        >
          {PRESENCES.map((presence) => {
            const selected = row.attendance === presence;
            return (
              <Button
                key={presence}
                size="small"
                aria-pressed={selected}
                variant={selected ? "contained" : "outlined"}
                color={selected ? ATTENDANCE_COLOUR[presence] : "inherit"}
                onClick={() => onSet(selected ? null : presence)}
                sx={{ minHeight: 44, width: "100%" }}
              >
                {ATTENDANCE_LABEL[presence]}
              </Button>
            );
          })}
        </Box>
        <Typography variant="body2" color="text.secondary">
          {row.attendance === null
            ? "Not marked"
            : `Saved · Caspian Hallowfield · ${ATTENDANCE_LABEL[row.attendance]}`}
        </Typography>
      </Stack>
    </Box>
  );
}

function Headline({ value, label }: { value: string; label: string }) {
  return (
    <Paper variant="outlined" sx={{ px: 2, py: 1.5, minWidth: 120 }}>
      <Typography variant="h6" sx={{ fontWeight: 700 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Paper>
  );
}
