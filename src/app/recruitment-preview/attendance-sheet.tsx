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
import { Scaffold } from "./chrome";
import {
  ATTENDANCE_COLOUR,
  ATTENDANCE_LABEL,
  EVENTS,
  SEASON_LABEL,
  type Attendance,
  type Recruit,
  type Rsvp,
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
      /** Coaches and other people on the team sit with the players who said no. */
      role: SheetPlayer["role"];
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
  // Recruits open because they are the point of a recruitment event; Attending
  // open because it is the list you work through; Everyone else closed, as the
  // shipped sheet already has it — a place to go when somebody turns up who
  // should not have.
  const [open, setOpen] = useState({
    recruits: true,
    attending: true,
    everyone: false,
    walkUps: true,
  });
  const [players, setPlayers] = useState<readonly SheetPlayer[]>(SHEET_PLAYERS);
  const [walkUps, setWalkUps] = useState<readonly string[]>([]);

  const needle = search.trim().toLowerCase();
  const matches = (name: string) => needle === "" || name.toLowerCase().includes(needle);

  /**
   * **Every recruit on the board, automatically** — Brian, 2026-09-01: "if a
   * recruit is already in our system and we're at a recruitment event, all
   * recruits should already be on the page for the event. If they happen to
   * show up, I'll mark them as present, even if they didn't RSVP."
   *
   * So there is no invitation filter here, and there deliberately cannot be
   * one. The shipped sheet derives its roster from memberships, which is why a
   * recruit does not appear on it at all; `W12` builds the recruit half, and
   * this is what that half is for. It also means the walk-up form is for a
   * genuinely new person and nobody else — an existing recruit is already on
   * this page, waiting to be marked.
   *
   * An exit status is not a gate on the door: somebody who declined can still
   * turn up, and the club records that they did.
   */
  const recruitRows: Row[] = store.recruits
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
    })
    // Yes, then No, then no answer — Brian, 2026-09-01. The recorder works down
    // from the people who said they were coming, which is the direction the
    // sheet's own two player groups already read in.
    .sort(
      (left, right) =>
        byRsvp(left.rsvp) - byRsvp(right.rsvp) || left.name.localeCompare(right.name),
    );

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
      role: player.role,
      key: player.key,
      name: player.displayName,
      rsvp: player.rsvp,
      attendance: player.attendance,
    }));

  /**
   * The shipped sheet's own two groups, unchanged, below the recruits — Brian,
   * 2026-09-01: "If a player RSVPed yes, they're at the top, and then everyone
   * else goes at the bottom of the list: all the players who said no, coaches,
   * and other people who are on the team."
   */
  const attendingRows = playerRows.filter((row) => row.rsvp === "yes");
  const everyoneElseRows = playerRows.filter((row) => row.rsvp !== "yes");

  function setRowAttendance(row: Row, attendance: Attendance) {
    if (row.kind === "recruit") {
      store.setAttendance(row.key, eventId, attendance);
      return;
    }
    setPlayers((prev) =>
      prev.map((player) => (player.key === row.key ? { ...player, attendance } : player)),
    );
  }

  const showed = [...recruitRows, ...walkUpRows, ...playerRows].filter(
    (row) => row.attendance !== null && row.attendance !== "absent",
  ).length;
  const onTheSheet = recruitRows.length + playerRows.length;

  if (capturing) {
    return (
      <WalkUpForm
        candidatesFor={(givenName, familyName, phone) =>
          store.recruits.filter((recruit) => {
            const last3 = (value: string | null) => (value ?? "").replace(/\D/g, "").slice(-3);
            return (
              recruit.givenName.toLowerCase() === givenName.toLowerCase() ||
              recruit.familyName.toLowerCase() === familyName.toLowerCase() ||
              (last3(phone) !== "" && last3(recruit.mobile) === last3(phone))
            );
          })
        }
        onLinkExisting={(id) => {
          // "This is them" writes attendance and creates nothing — the whole
          // point of checking before minting.
          store.setAttendance(id, eventId, "present");
          setJustAdded(store.find(id)?.displayName ?? null);
          setCapturing(false);
        }}
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
        <Headline value={String(onTheSheet)} label="On the sheet" />
        <Headline
          value={String([...recruitRows, ...playerRows].filter((row) => row.rsvp === "yes").length)}
          label="Said yes"
        />
        <Headline value={`${showed} / ${onTheSheet}`} label="Showed" />
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
          detail="Every recruit on the board this season, the ones who said yes first."
          count={recruitRows.length}
          open={open.recruits}
          onToggle={() => setOpen((prev) => ({ ...prev, recruits: !prev.recruits }))}
          rows={recruitRows}
          onSet={setRowAttendance}
        />
        <Group
          label="Attending"
          detail="Said yes to this event"
          count={attendingRows.length}
          open={open.attending}
          onToggle={() => setOpen((prev) => ({ ...prev, attending: !prev.attending }))}
          rows={attendingRows}
          onSet={setRowAttendance}
        />
        <Group
          label="Everyone else"
          detail="Said no or have not answered, coaches, and anyone else on the team"
          count={everyoneElseRows.length}
          open={open.everyone}
          onToggle={() => setOpen((prev) => ({ ...prev, everyone: !prev.everyone }))}
          rows={everyoneElseRows}
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
  candidatesFor,
  onLinkExisting,
  onCancel,
  onSave,
}: {
  candidatesFor: (givenName: string, familyName: string, phone: string) => readonly Recruit[];
  onLinkExisting: (id: string) => void;
  onCancel: () => void;
  onSave: (displayName: string) => void;
}) {
  const [given, setGiven] = useState("Marguerite");
  const [family, setFamily] = useState("Fennimore");
  const [phone, setPhone] = useState("07700 900102");
  const [email, setEmail] = useState("");
  /** `null` until the check has run. Empty once it has run and matched nobody. */
  const [candidates, setCandidates] = useState<readonly Recruit[] | null>(null);

  const ready = given.trim() !== "" && family.trim() !== "" && phone.trim() !== "";

  /**
   * The check runs **before** anything is written, on every save, at this door
   * too — Brian, 2026-09-01.
   *
   * It reverses his own 2026-08-28 removal of the roster-match path ("they know
   * who's on their roster, there are only 40 people"), which is why the shipped
   * `mintWalkUpProspect` goes straight to `insert into public.people` with no
   * lookup at all. It also makes true the condition he attached to approving
   * `W5`: that the check before a walk-up match what the club does elsewhere.
   *
   * It matches nobody and saves straight through in the common case, so the
   * touchline cost is one press. It only ever interrupts when there is
   * something to say.
   */
  function check() {
    const found = candidatesFor(given.trim(), family.trim(), phone.trim());
    if (found.length === 0) {
      onSave(`${given.trim()} ${family.trim()}`);
      return;
    }
    setCandidates(found);
  }

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

        {candidates !== null && candidates.length > 0 ? (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={2}>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Already in the club
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {candidates.length === 1
                    ? "One record looks like this person. Nothing has been written yet."
                    : `${candidates.length} records look like this person. Nothing has been written yet.`}
                </Typography>
              </Box>
              {candidates.map((candidate) => (
                <Paper key={candidate.id} variant="outlined" sx={{ p: 1.5 }}>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1.5}
                    sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body1" sx={{ fontWeight: 700 }}>
                        {candidate.displayName}
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: "primary.main" }}>
                        {`Recruit · ${candidate.status} · ${SEASON_LABEL}`}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {candidate.mobile
                          ? `Mobile ending ${candidate.mobile.replace(/\D/g, "").slice(-3)}`
                          : "No mobile recorded"}
                      </Typography>
                    </Box>
                    <Button
                      variant="outlined"
                      onClick={() => onLinkExisting(candidate.id)}
                      sx={{ minHeight: 44, flexShrink: 0 }}
                    >
                      This is them
                    </Button>
                  </Stack>
                </Paper>
              ))}
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <Button
                  variant="contained"
                  onClick={() => onSave(`${given.trim()} ${family.trim()}`)}
                  sx={{ minHeight: 44 }}
                >
                  This is somebody new
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => setCandidates(null)}
                  sx={{ minHeight: 44 }}
                >
                  Go back and change the details
                </Button>
              </Stack>
            </Stack>
          </Paper>
        ) : null}

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
          <Button variant="contained" disabled={!ready} onClick={check} sx={{ minHeight: 44 }}>
            {WALK_UP_SUBMIT}
          </Button>
          <Button variant="outlined" onClick={onCancel} sx={{ minHeight: 44 }}>
            Cancel
          </Button>
        </Stack>
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

/** Yes, then No, then no answer. */
function byRsvp(rsvp: Rsvp): number {
  return rsvp === "yes" ? 0 : rsvp === "no" ? 1 : 2;
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
          {row.kind === "player" && row.role === "coach"
            ? "Coach"
            : row.kind === "recruit" && row.isWalkUp
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
