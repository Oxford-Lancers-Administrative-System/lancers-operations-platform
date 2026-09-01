"use client";

import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ShellNav from "@/app/operate/shell-nav";
import type { Destination } from "@/app/operate/destinations";
import { ATTENDANCE_BAND, PERSON_BAND, RECRUITMENT_BAND, EVENT_BAND } from "./columns";
import { STATUS_COLOUR, type ProspectStatus } from "./fixtures";
import { OPERATOR_NAME, OPERATOR_ROLE } from "./store";

/**
 * The chrome every surface in this mockup borrows — LAN-200.
 *
 * The point of the file is that almost nothing in it is new. `ShellNav` is the
 * shipped component, imported rather than redrawn; the header, the banded
 * card, the label/value row and the recruit-facing paper are the shipped
 * shapes copied from `/operate/layout.tsx`,
 * `/operate/roster/[membershipId]/record-view.tsx` and `/rsvp/[token]/page.tsx`
 * respectively. That is the whole reason this mockup looks like the product
 * instead of like a sketch, and it is the reason a card with a recruitment
 * heading cannot end up over the player record's own content: the content is
 * written here, not inherited from a page that was photographed.
 */

/**
 * The sidebar, with Recruitment second — "a new page on the sidebar underneath
 * Roster, and it's under /operate", Brian, 2026-08-31. The Administration
 * group is unchanged and deliberately carries no Recruits entry.
 *
 * Recruitment's `href` is this preview's own route so `ShellNav` marks it
 * current, exactly as it would on the real page. **Every other entry is the
 * real link** and leads to the real, authenticated application — which is
 * honest, and which is also why they are the fastest way to leave the mockup
 * by accident.
 */
const PREVIEW_DESTINATIONS: readonly Destination[] = Object.freeze([
  Object.freeze({ href: "/operate/roster", label: "Roster", capability: null }),
  Object.freeze({ href: "/recruitment-preview", label: "Recruitment", capability: null }),
  Object.freeze({ href: "/operate/events", label: "Events", capability: null }),
  Object.freeze({ href: "/operate/report", label: "Report", capability: null }),
]);

const PREVIEW_ADMINISTRATION: readonly Destination[] = Object.freeze([
  Object.freeze({ href: "/operate/admin/follow-ups", label: "Follow-ups", capability: null }),
  Object.freeze({ href: "/operate/people", label: "People", capability: null }),
  Object.freeze({ href: "/operate/people/missing", label: "Missing data", capability: null }),
  Object.freeze({ href: "/operate/admin/operators", label: "Operators", capability: null }),
  Object.freeze({
    href: "/operate/admin/messaging",
    label: "Messaging schedule",
    capability: null,
  }),
  Object.freeze({ href: "/operate/admin/roles", label: "Roles", capability: null }),
]);

/**
 * The `/operate` frame, cloned from `src/app/operate/layout.tsx`.
 *
 * Cloned rather than reused because the real layout resolves an operator
 * against a real session and redirects to `/login` when there is not one. A
 * mockup needing a login and a database lease is a mockup nobody opens.
 */
export function OperatorFrame({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: { xs: "column", md: "row" },
        minHeight: "100dvh",
        alignItems: "stretch",
      }}
    >
      <ShellNav
        operatorName={OPERATOR_NAME}
        destinations={PREVIEW_DESTINATIONS}
        administration={PREVIEW_ADMINISTRATION}
        sectionLabel="Operations"
        roleCaption={OPERATOR_ROLE}
      />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          px: { xs: 2, md: 4 },
          pb: { xs: 3, md: 4 },
          pt: { xs: 10, md: 4 },
        }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{ alignItems: { sm: "center" }, justifyContent: "space-between", mb: 3 }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h5" component="p" sx={{ fontWeight: 800 }}>
              Lancers Operations
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Signed in as {OPERATOR_NAME}
            </Typography>
          </Box>
          <Button variant="outlined" disabled>
            Sign out
          </Button>
        </Stack>
        {children}
      </Box>
    </Box>
  );
}

/**
 * What a recruit sees — the shipped `/rsvp/[token]` shell, copied whole.
 *
 * The grey ground, the 720px column, the small capitalised banner and the
 * white paper are all that page's, so the sign-up form, both questionnaires
 * and the yes/no pages read as one product to somebody who only ever sees
 * these four screens.
 */
export function RecruitFrame({ url, children }: { url: string; children: ReactNode }) {
  return (
    <Box sx={{ bgcolor: "grey.100", py: { xs: 3, sm: 4 }, px: 2 }}>
      <Box sx={{ maxWidth: 720, mx: "auto" }}>
        <Typography
          component="p"
          sx={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: "text.secondary",
            mb: 2,
          }}
        >
          LANCERS OPERATIONS
        </Typography>
        {/* The address bar, so a frame never lies about where the recruit is. */}
        <Paper
          variant="outlined"
          sx={{
            px: 2,
            py: 1,
            mb: 2,
            borderRadius: 2,
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
            fontSize: 13,
            color: "text.secondary",
            overflowX: "auto",
            whiteSpace: "nowrap",
          }}
        >
          {url}
        </Paper>
        <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: 2 }}>
          {children}
        </Paper>
      </Box>
    </Box>
  );
}

const BAND_COLOURS = {
  person: PERSON_BAND,
  recruitment: RECRUITMENT_BAND,
  event: EVENT_BAND,
  attendance: ATTENDANCE_BAND,
} as const;

/**
 * One banded card — the shipped player record's `Section`, copied with its
 * content replaced. `W2`: "Every card is a shipped card from
 * `/operate/roster/[membershipId]` with its content replaced… We shouldn't
 * invent UI elements here."
 */
export function Section({
  band,
  title,
  action,
  children,
}: {
  band: keyof typeof BAND_COLOURS;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const colours = BAND_COLOURS[band];
  return (
    <Paper variant="outlined" sx={{ overflow: "hidden" }} data-testid={`section-${band}-${title}`}>
      <Stack
        direction="row"
        sx={{
          bgcolor: colours.header,
          color: "common.white",
          px: 2,
          py: 0.75,
          justifyContent: "space-between",
          alignItems: "center",
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <Typography variant="overline" sx={{ fontWeight: 700 }} component="h2">
          {title}
        </Typography>
        {action ?? null}
      </Stack>
      <Box sx={{ bgcolor: colours.tint, px: 2, py: 0.5 }}>{children}</Box>
    </Paper>
  );
}

/** The record's label/value row, copied from `record-view.tsx`. */
export function Row({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={{ xs: 0.25, sm: 2 }}
      sx={{
        py: 1,
        borderTop: 1,
        borderColor: "divider",
        alignItems: { sm: "baseline" },
        "&:first-of-type": { borderTop: "none" },
      }}
      data-testid="record-row"
      data-label={label}
    >
      <Box sx={{ minWidth: { sm: 220 }, flexShrink: 0 }}>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
      </Box>
      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        {children}
        {note ? (
          <Typography variant="caption" sx={{ display: "block", color: "text.disabled", mt: 0.25 }}>
            {note}
          </Typography>
        ) : null}
      </Box>
    </Stack>
  );
}

/** `not recorded`, in the record's own grey italic. */
export function NotRecorded({ word = "not recorded" }: { word?: string }) {
  return (
    <Typography variant="body2" sx={{ color: "text.disabled", fontStyle: "italic" }}>
      {word}
    </Typography>
  );
}

/**
 * The status chip.
 *
 * Colour-coded, which is the one exception the roster board already makes to
 * "plain text like every other select cell" — a status is the single fact an
 * operator scans the whole row for. The word is always there beside the
 * colour, per `slice-ux.md` § 7.
 */
export function StatusChip({
  status,
  size = "small",
}: {
  status: ProspectStatus;
  size?: "small" | "medium";
}) {
  return (
    <Chip
      size={size}
      label={status}
      sx={{
        bgcolor: STATUS_COLOUR[status],
        color: "common.white",
        fontWeight: 600,
        "& .MuiChip-label": { px: 1.25 },
      }}
    />
  );
}

/**
 * A dashed panel — **scaffolding, not a screen.**
 *
 * Everything drawn inside one of these is the mockup explaining itself: the
 * audit stream, the state switches, and the notes that say what a real
 * implementation would do instead. None of it is proposed UI, and none of it
 * should be built.
 */
export function Scaffold({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Box
      sx={{
        border: "1px dashed",
        borderColor: "grey.500",
        borderRadius: 2,
        p: 2,
        bgcolor: "grey.50",
      }}
    >
      <Stack
        direction="row"
        sx={{
          justifyContent: "space-between",
          alignItems: "center",
          gap: 2,
          flexWrap: "wrap",
          mb: 1,
        }}
      >
        <Typography variant="overline" sx={{ fontWeight: 700, color: "text.secondary" }}>
          {title} · scaffolding, not a screen
        </Typography>
        {action ?? null}
      </Stack>
      {children}
    </Box>
  );
}

/** A one-line explanation under a control, in the mockup's own voice. */
export function Aside({ children }: { children: ReactNode }) {
  return (
    <Typography variant="body2" sx={{ color: "text.secondary", fontStyle: "italic", mt: 1.5 }}>
      {children}
    </Typography>
  );
}
