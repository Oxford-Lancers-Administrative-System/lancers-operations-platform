"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddRecruit from "./add-recruit";
import AttendanceSheet from "./attendance-sheet";
import { OperatorFrame } from "./chrome";
import ConsentStates from "./consent-states";
import EventFlow from "./event-flow";
import QrPage from "./qr-page";
import QuestionnaireB from "./questionnaire-b";
import RecruitBoard from "./recruit-board";
import RecruitRecord from "./recruit-record";
import SignUpForm from "./sign-up";
import { useRecruitmentStore } from "./store";

/**
 * The mockup's own root — LAN-200.
 *
 * Eleven surfaces, one store, and a picker at the foot of the screen. The
 * picker is **scaffolding**: it is dashed, it says so, and nothing about it is
 * proposed. It is fixed to the bottom rather than the top so it never fights
 * the shell's own phone bar, which is fixed to the top and would cover it.
 *
 * ## Why this is a view switch and not eleven routes
 *
 * The real surfaces are real routes and **should be** — `/operate/recruitment`,
 * `/operate/recruitment/[prospectId]`, `/operate/recruitment/new`,
 * `/operate/recruitment/qr`, `/operate/events/[id]/attendance`, `/a/[token]`,
 * `/rsvp/[token]`, and a public page on the club's own domain. But every
 * surface here reads one set of rows, and keeping that true across a navigation
 * needs a server. The shared state is the thing worth demonstrating: a status
 * changed in a cell is changed on the record, on the event sheet, in the
 * consent table and in the audit stream, because all five are reading the same
 * store.
 */

type SurfaceKey =
  | "board"
  | "record"
  | "qr"
  | "add"
  | "walk-up"
  | "attendance"
  | "sign-up"
  | "questionnaire"
  | "event-flow"
  | "consent";

interface SurfaceDef {
  readonly key: SurfaceKey;
  readonly label: string;
  readonly workflows: string;
  /** Whether it renders inside the `/operate` shell. */
  readonly framed: boolean;
}

const SURFACES: readonly SurfaceDef[] = Object.freeze([
  { key: "board", label: "The recruit board", workflows: "W1 · W13 · W14", framed: true },
  { key: "record", label: "One recruit's record", workflows: "W2", framed: true },
  { key: "walk-up", label: "Walk-up capture", workflows: "W5", framed: true },
  {
    key: "add",
    label: "Add a recruit, and the duplicate check",
    workflows: "W6 · W8",
    framed: true,
  },
  {
    key: "sign-up",
    label: "The sign-up form, the consent gate",
    workflows: "W7 · W4-A",
    framed: false,
  },
  { key: "qr", label: "The season QR page", workflows: "W1-04 · W10", framed: true },
  { key: "questionnaire", label: "Questionnaire B", workflows: "W4-B", framed: false },
  { key: "attendance", label: "Recruitment event attendance", workflows: "W12", framed: true },
  {
    key: "event-flow",
    label: "The recruit's event flow after WhatsApp",
    workflows: "W11",
    framed: false,
  },
  { key: "consent", label: "Consent states, end to end", workflows: "new", framed: false },
]);

export default function RecruitmentPreview() {
  const store = useRecruitmentStore();
  const [surface, setSurface] = useState<SurfaceKey>("board");
  const [openRecruitId, setOpenRecruitId] = useState<string>("p-rosalind");

  const definition = SURFACES.find((entry) => entry.key === surface) ?? SURFACES[0];
  const openRecruit = store.find(openRecruitId) ?? store.recruits[0];

  function openRecord(id: string) {
    setOpenRecruitId(id);
    setSurface("record");
  }

  const body = (() => {
    switch (surface) {
      case "board":
        return (
          <RecruitBoard
            store={store}
            onOpenRecruit={openRecord}
            onAddRecruit={() => setSurface("add")}
            onOpenQr={() => setSurface("qr")}
          />
        );
      case "record":
        return (
          <RecruitRecord recruit={openRecruit} store={store} onBack={() => setSurface("board")} />
        );
      case "qr":
        return <QrPage store={store} onBack={() => setSurface("board")} />;
      case "add":
        return (
          <AddRecruit
            store={store}
            onCancel={() => setSurface("board")}
            onOpenRecruit={openRecord}
          />
        );
      case "walk-up":
        return <AttendanceSheet store={store} eventId="taster-2" openCaptureFirst />;
      case "attendance":
        return <AttendanceSheet store={store} eventId="freshers-fair" openCaptureFirst={false} />;
      case "sign-up":
        return <SignUpForm />;
      case "questionnaire":
        return <QuestionnaireB />;
      case "event-flow":
        return <EventFlow />;
      case "consent":
        return <ConsentStates store={store} />;
      default:
        return null;
    }
  })();

  return (
    <Box sx={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        {definition.framed ? (
          <OperatorFrame>{body}</OperatorFrame>
        ) : (
          <Box sx={{ maxWidth: 1100, mx: "auto", px: { xs: 2, md: 4 }, py: { xs: 3, md: 4 } }}>
            {body}
          </Box>
        )}
      </Box>
      <PreviewStrip
        surface={surface}
        onSurface={setSurface}
        onReset={() => {
          store.reset();
          setOpenRecruitId("p-rosalind");
        }}
      />
    </Box>
  );
}

function PreviewStrip({
  surface,
  onSurface,
  onReset,
}: {
  surface: SurfaceKey;
  onSurface: (key: SurfaceKey) => void;
  onReset: () => void;
}) {
  return (
    <Box
      sx={{
        // Sticky rather than fixed. Fixed was stamped across the middle of
        // every full-page screenshot, which is the form these surfaces are
        // reviewed in; sticky holds the same place on screen and lands at the
        // foot of a capture.
        position: "sticky",
        bottom: 0,
        zIndex: (theme) => theme.zIndex.appBar + 2,
        bgcolor: "grey.50",
        borderTop: "2px dashed",
        borderColor: "grey.600",
        px: { xs: 1.5, md: 3 },
        py: 1,
        maxHeight: { xs: "40vh", md: "none" },
        overflowY: "auto",
      }}
    >
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={1}
        sx={{ alignItems: { md: "center" }, gap: 1 }}
      >
        <Typography
          variant="overline"
          sx={{ fontWeight: 700, color: "text.secondary", flexShrink: 0, lineHeight: 1.4 }}
        >
          LAN-200 mockup · never merged
        </Typography>

        {/* Desktop: every surface, visible at once, so the review has no menu in it. */}
        <Stack
          direction="row"
          spacing={0.75}
          sx={{ display: { xs: "none", md: "flex" }, flexWrap: "wrap", gap: 0.75, flexGrow: 1 }}
        >
          {SURFACES.map((entry) => (
            <Button
              key={entry.key}
              size="small"
              variant={surface === entry.key ? "contained" : "outlined"}
              onClick={() => onSurface(entry.key)}
              sx={{ textTransform: "none", py: 0.25 }}
            >
              {entry.label}
              <Box component="span" sx={{ ml: 0.75, opacity: 0.7, fontSize: 11 }}>
                {entry.workflows}
              </Box>
            </Button>
          ))}
        </Stack>

        {/* Phone: a select, because eleven buttons at 375px is a screen of buttons. */}
        <TextField
          select
          size="small"
          label="Surface"
          value={surface}
          onChange={(event) => onSurface(event.target.value as SurfaceKey)}
          sx={{ display: { xs: "block", md: "none" }, width: "100%" }}
        >
          {SURFACES.map((entry) => (
            <MenuItem key={entry.key} value={entry.key}>
              {`${entry.label} · ${entry.workflows}`}
            </MenuItem>
          ))}
        </TextField>

        <Button size="small" onClick={onReset} sx={{ flexShrink: 0 }}>
          Reset the data
        </Button>
      </Stack>
    </Box>
  );
}
