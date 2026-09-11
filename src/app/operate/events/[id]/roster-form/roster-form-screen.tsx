"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import GlobalStyles from "@mui/material/GlobalStyles";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { Notice } from "@/components/notice";
import { Field, SelectField } from "@/components/field";
import { Section } from "@/components/section";
import { ActionBar } from "@/components/action-bar";
import { EmptyState } from "@/components/empty-state";
import {
  formNameOf,
  missingNumberWarning,
  printedPlayerRows,
  ROSTER_FORM_TEAM,
  type Kit,
  type RosterFormCoachRow,
  type RosterFormPlayer,
} from "@/lib/services/roster-form-shape";

import { generateRosterFormAction } from "./actions";
import {
  BACK_TO_PICKING,
  COACHES_TITLE,
  COLUMN_BAFA,
  COLUMN_DRESSED,
  COLUMN_JERSEY,
  COLUMN_ROLE,
  COLUMN_RSVP,
  COLUMN_STUDENT_NUMBER,
  DATE_LABEL,
  DRESSED_COUNT,
  EMPTY_ROSTER,
  FILTERS_TITLE,
  GENERATE,
  GENERATED_NOTE,
  KIT_LABEL,
  KIT_OPTIONS,
  MISSING_BAFA_NUMBERS,
  MISSING_STUDENT_NUMBERS,
  NOT_ON_THE_FORM,
  NO_COACHES,
  NO_JERSEY,
  OPPONENT_HELPER,
  OPPONENT_LABEL,
  PLAYERS_TITLE,
  PRINT,
  RSVP_LABEL,
  RSVP_NO,
  RSVP_OPTIONS,
  RSVP_UNANSWERED,
  RSVP_YES,
  SELECT_ALL,
  SELECT_NONE,
  TEAM_LABEL,
} from "./presentation";

/**
 * The pick-and-tick screen, and the printed form — LAN-267.
 *
 * One page, two states: filter/tick, then the same page becomes the printed
 * form, derived entirely from what was already loaded (nothing re-fetched).
 *
 * The print stylesheet is scoped to this page via MUI's `GlobalStyles`
 * (unmounts with the component) using a `visibility` idiom — `display: none`
 * on the shell would need cooperation this page's parent shell can't give.
 *
 * LAN-267: the printed page is not a 375 target; the picking screen is.
 */

type RsvpFilter = "all" | "yes" | "no" | "unanswered";

const PRINT_STYLES = {
  "@media print": {
    "body *": { visibility: "hidden" },
    "[data-roster-form-sheet], [data-roster-form-sheet] *": { visibility: "visible" },
    "[data-roster-form-sheet]": {
      position: "absolute",
      left: 0,
      top: 0,
      width: "100%",
      padding: 0,
      margin: 0,
    },
    "[data-print-hide]": { display: "none !important" },
    // The officials' form is one page per game; a table that breaks a row in
    // half across a sheet boundary is a row nobody can read.
    "tr, td, th": { pageBreakInside: "avoid" },
  },
} as const;

export interface RosterFormScreenProps {
  readonly eventId: string;
  readonly eventName: string;
  readonly scheduledOn: string | null;
  readonly players: readonly RosterFormPlayer[];
  readonly coaches: readonly RosterFormCoachRow[];
  readonly kit: Kit;
}

function rsvpLabel(rsvp: "yes" | "no" | null): string {
  if (rsvp === "yes") return RSVP_YES;
  if (rsvp === "no") return RSVP_NO;
  return RSVP_UNANSWERED;
}

function matchesRsvp(player: RosterFormPlayer, filter: RsvpFilter): boolean {
  if (filter === "all") return true;
  if (filter === "unanswered") return player.rsvp === null;
  return player.rsvp === filter;
}

export function RosterFormScreen({
  eventId,
  eventName,
  scheduledOn,
  players,
  coaches,
  kit,
}: RosterFormScreenProps) {
  // Kit lives in the URL, not state — it decides jersey numbers (a DB fact),
  // and re-reading resets ticks (blue numbers say nothing about white).
  const router = useRouter();
  const pathname = usePathname();
  const [rsvpFilter, setRsvpFilter] = useState<RsvpFilter>("all");
  const [opponent, setOpponent] = useState(eventName);
  // Everybody with a number in this kit starts ticked: the common case is the
  // whole dressed squad, and unticking two is less work than ticking forty.
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const [generated, setGenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const visible = useMemo(
    () => players.filter((player) => matchesRsvp(player, rsvpFilter)),
    [players, rsvpFilter],
  );

  const dressed = useMemo(
    () => visible.filter((player) => !unticked.has(player.membershipId)),
    [visible, unticked],
  );

  const rows = useMemo(() => printedPlayerRows(dressed), [dressed]);
  const warning = useMemo(() => missingNumberWarning(dressed, coaches), [dressed, coaches]);

  const toggle = (membershipId: string) => {
    setUnticked((current) => {
      const next = new Set(current);
      if (next.has(membershipId)) next.delete(membershipId);
      else next.add(membershipId);
      return next;
    });
  };

  const generate = () => {
    setError(null);
    startTransition(async () => {
      const result = await generateRosterFormAction(eventId, kit, dressed.length, coaches.length);
      if (result.error !== null) {
        setError(result.error);
        return;
      }
      setGenerated(true);
    });
  };

  if (generated) {
    return (
      <>
        <GlobalStyles styles={PRINT_STYLES} />
        <Stack spacing={2}>
          <Box data-print-hide>
            <Notice severity="success">{GENERATED_NOTE}</Notice>
          </Box>
          <Box data-print-hide>
            <ActionBar
              primary={
                <Button variant="contained" onClick={() => window.print()}>
                  {PRINT}
                </Button>
              }
              secondary={
                <Button variant="text" onClick={() => setGenerated(false)}>
                  {BACK_TO_PICKING}
                </Button>
              }
            />
          </Box>

          <PrintedForm
            opponent={opponent}
            scheduledOn={scheduledOn}
            rows={rows}
            coaches={coaches}
            warning={warning}
          />
        </Stack>
      </>
    );
  }

  return (
    <Stack spacing={3}>
      {error ? <Notice severity="error">{error}</Notice> : null}

      <Section title={FILTERS_TITLE}>
        <Stack spacing={2}>
          <SelectField
            name="kit"
            label={KIT_LABEL}
            value={kit}
            onChange={(event) => router.replace(`${pathname}?kit=${event.target.value}`)}
            options={KIT_OPTIONS.map((option) => ({ ...option }))}
          />
          <SelectField
            name="rsvp"
            label={RSVP_LABEL}
            value={rsvpFilter}
            onChange={(event) => setRsvpFilter(event.target.value as RsvpFilter)}
            options={RSVP_OPTIONS.map((option) => ({ ...option }))}
          />
          <Field
            name="opponent"
            label={OPPONENT_LABEL}
            value={opponent}
            onChange={(event) => setOpponent(event.target.value)}
            helperText={OPPONENT_HELPER}
          />
        </Stack>
      </Section>

      <Section title={PLAYERS_TITLE}>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
            <Typography sx={{ fontSize: 14, fontWeight: 600, mr: "auto" }}>
              {DRESSED_COUNT(dressed.length)}
            </Typography>
            <Button size="small" onClick={() => setUnticked(new Set())}>
              {SELECT_ALL}
            </Button>
            <Button
              size="small"
              onClick={() => setUnticked(new Set(visible.map((p) => p.membershipId)))}
            >
              {SELECT_NONE}
            </Button>
          </Stack>

          {visible.length === 0 ? (
            <EmptyState title={EMPTY_ROSTER} testId="roster-form-empty" />
          ) : (
            <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
              {visible.map((player) => (
                <Box
                  component="li"
                  key={player.membershipId}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    py: 1,
                    borderBottom: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  <Checkbox
                    checked={!unticked.has(player.membershipId)}
                    onChange={() => toggle(player.membershipId)}
                    slotProps={{
                      input: { "aria-label": `${COLUMN_DRESSED} — ${formNameOf(player)}` },
                    }}
                  />
                  <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
                    <Typography sx={{ fontSize: 15, fontWeight: 600 }}>
                      {formNameOf(player)}
                    </Typography>
                    <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                      {COLUMN_JERSEY}:{" "}
                      {player.jerseyNumber !== null ? player.jerseyNumber : NO_JERSEY} ·{" "}
                      {COLUMN_STUDENT_NUMBER}: {player.studentNumber ?? "—"} · {COLUMN_RSVP}:{" "}
                      {rsvpLabel(player.rsvp)}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Stack>
      </Section>

      <ActionBar
        primary={
          <Button variant="contained" onClick={generate} disabled={pending}>
            {GENERATE}
          </Button>
        }
      />
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// The printed page — the officials' own three tables
// ---------------------------------------------------------------------------

const CELL = {
  border: "1px solid #000",
  padding: "2px 6px",
  fontSize: 11,
  textAlign: "left",
  height: 20,
} as const;

const HEAD_CELL = { ...CELL, fontWeight: 700 } as const;

/**
 * LAN-267's own plain black-on-white table — nothing copied from the Word
 * template.
 */
function PrintedForm({
  opponent,
  scheduledOn,
  rows,
  coaches,
  warning,
}: {
  opponent: string;
  scheduledOn: string | null;
  rows: ReturnType<typeof printedPlayerRows>;
  coaches: readonly RosterFormCoachRow[];
  warning: ReturnType<typeof missingNumberWarning>;
}) {
  const hasWarning =
    warning.players.length > 0 || warning.coaches.length > 0 || warning.notDressable.length > 0;

  return (
    <Box data-roster-form-sheet sx={{ backgroundColor: "#fff", color: "#000", p: 2 }}>
      <Typography component="h2" sx={{ fontSize: 16, fontWeight: 700, mb: 1 }}>
        BAFRA Roster Form
      </Typography>

      <Stack direction="row" spacing={3} sx={{ mb: 1.5, flexWrap: "wrap" }}>
        <Typography sx={{ fontSize: 12 }}>
          <strong>{TEAM_LABEL}:</strong> {ROSTER_FORM_TEAM}
        </Typography>
        <Typography sx={{ fontSize: 12 }}>
          <strong>{DATE_LABEL}:</strong> {scheduledOn ?? "—"}
        </Typography>
        <Typography sx={{ fontSize: 12 }}>
          <strong>{OPPONENT_LABEL}:</strong> {opponent || "—"}
        </Typography>
      </Stack>

      {/* Printed with the form — an operator can fill a blank by hand at the ground once it's flagged here. */}
      {hasWarning ? (
        <Box sx={{ border: "1px solid #000", p: 1, mb: 1.5 }}>
          {warning.notDressable.length > 0 ? (
            <Typography sx={{ fontSize: 11 }}>{NOT_ON_THE_FORM(warning.notDressable)}</Typography>
          ) : null}
          {warning.players.length > 0 ? (
            <Typography sx={{ fontSize: 11 }}>
              {MISSING_STUDENT_NUMBERS(warning.players)}
            </Typography>
          ) : null}
          {warning.coaches.length > 0 ? (
            <Typography sx={{ fontSize: 11 }}>{MISSING_BAFA_NUMBERS(warning.coaches)}</Typography>
          ) : null}
        </Box>
      ) : null}

      <Typography component="h3" sx={{ fontSize: 13, fontWeight: 700, mb: 0.5 }}>
        {PLAYERS_TITLE}
      </Typography>
      <Box
        component="table"
        sx={{ width: "100%", borderCollapse: "collapse", mb: 2, tableLayout: "fixed" }}
      >
        <Box component="thead">
          <Box component="tr">
            <Box component="th" sx={{ ...HEAD_CELL, width: "56%" }}>
              Surname, Forename
            </Box>
            <Box component="th" sx={{ ...HEAD_CELL, width: "28%" }}>
              {COLUMN_STUDENT_NUMBER}
            </Box>
            <Box component="th" sx={{ ...HEAD_CELL, width: "16%" }}>
              Jersey no
            </Box>
          </Box>
        </Box>
        <Box component="tbody">
          {rows.map((row) => (
            <Box component="tr" key={row.jerseyNumber}>
              <Box component="td" sx={CELL}>
                {row.name ?? ""}
              </Box>
              <Box component="td" sx={CELL}>
                {row.studentNumber ?? ""}
              </Box>
              <Box component="td" sx={CELL}>
                {row.jerseyNumber}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      <Typography component="h3" sx={{ fontSize: 13, fontWeight: 700, mb: 0.5 }}>
        {COACHES_TITLE}
      </Typography>
      <Box
        component="table"
        sx={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}
      >
        <Box component="thead">
          <Box component="tr">
            <Box component="th" sx={{ ...HEAD_CELL, width: "56%" }}>
              Surname, Forename
            </Box>
            <Box component="th" sx={{ ...HEAD_CELL, width: "28%" }}>
              {COLUMN_BAFA}
            </Box>
            <Box component="th" sx={{ ...HEAD_CELL, width: "16%" }}>
              {COLUMN_ROLE}
            </Box>
          </Box>
        </Box>
        <Box component="tbody">
          {coaches.map((coach) => (
            <Box component="tr" key={coach.personId}>
              <Box component="td" sx={CELL}>
                {formNameOf(coach)}
              </Box>
              <Box component="td" sx={CELL}>
                {coach.bafaRegistrationNumber ?? ""}
              </Box>
              <Box component="td" sx={CELL}>
                {coach.roleCode}
              </Box>
            </Box>
          ))}
          {/* Fixed shape regardless of roster size — blanks for uncatalogued sideline roles and spares for on-the-day additions. */}
          {Array.from({ length: Math.max(0, 12 - coaches.length) }).map((_, index) => (
            <Box component="tr" key={`blank-${index}`}>
              <Box component="td" sx={CELL} />
              <Box component="td" sx={CELL} />
              <Box component="td" sx={CELL} />
            </Box>
          ))}
        </Box>
      </Box>

      {coaches.length === 0 ? (
        <Typography data-print-hide sx={{ fontSize: 11, mt: 1 }}>
          {NO_COACHES}
        </Typography>
      ) : null}
    </Box>
  );
}
