import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

/**
 * LAN-195 — the preview's own scaffolding: the harness banner and the five
 * framed panels. Everything in this file is chrome, not product — styled dark
 * and monospaced, above the application frame, the same convention
 * `roster-preview/preview-shell.tsx` uses and explains.
 *
 * ## Why iframes, not a resized `Box`
 *
 * The real component and the proposal both use MUI's responsive `sx` props,
 * which compile to `@media` queries against the **browser's** viewport. Put
 * either one inside a 375px-wide `Box` on a desktop browser and the media
 * query still reads the desktop width — the content does not narrow, it just
 * gets clipped or overflows its box. An `<iframe>` is a different document
 * with its own initial containing block, sized by its own `width` attribute,
 * so `@media` queries evaluate against *that* — a genuinely narrow viewport,
 * regardless of how wide Brian's own window is. That is what "browser
 * resizing does not reliably reach 375px, so build the width into the page"
 * means in practice: the frame has to be a real viewport, not a styled box.
 */
export default function PreviewShell() {
  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "#f4f4f5", py: { xs: 3, md: 5 } }}>
      <Box sx={{ maxWidth: 1180, mx: "auto", px: { xs: 2, md: 3 } }}>
        <HarnessBanner />

        <SectionHeading title="375px — today vs. the proposal" />
        <FrameRow>
          <PhoneFrame label="Today — nine-item bottom bar (the defect)" src="/nav-preview/live-shell" />
          <PhoneFrame label="Proposed — drawer closed" src="/nav-preview/proposed-shell" />
        </FrameRow>

        <SectionHeading title="375px — the drawer open" sx={{ mt: 5 }} />
        <FrameRow>
          <PhoneFrame label="Proposed — drawer open" src="/nav-preview/proposed-shell?open=1" />
        </FrameRow>

        <SectionHeading title="Desktop — unchanged" sx={{ mt: 5 }} />
        <FrameRow wide>
          <WideFrame label="Today — real ShellNav, untouched" src="/nav-preview/live-shell" />
          <WideFrame label="Proposed, same width — for parity" src="/nav-preview/proposed-shell" />
        </FrameRow>
      </Box>
    </Box>
  );
}

function HarnessBanner() {
  return (
    <Box sx={{ bgcolor: "grey.900", color: "common.white", px: { xs: 2, md: 3 }, py: 1.5, mb: 3, borderRadius: 1 }}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={{ xs: 1, md: 3 }}
        sx={{ alignItems: { md: "center" }, justifyContent: "space-between" }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Chip
            size="small"
            label="Fidelity mockup"
            sx={{ bgcolor: "warning.main", color: "common.black", fontWeight: 700 }}
          />
          <Typography
            variant="body2"
            sx={{ fontFamily: "var(--font-geist-mono), monospace", color: "grey.400" }}
          >
            LAN-195 · not `shell-nav.tsx` · no auth, no database
          </Typography>
        </Stack>
        <Typography
          variant="body2"
          sx={{ fontFamily: "var(--font-geist-mono), monospace", color: "grey.400" }}
        >
          each frame below is a real, separately-rendered viewport
        </Typography>
      </Stack>
    </Box>
  );
}

function SectionHeading({ title, sx }: { title: string; sx?: object }) {
  return (
    <Typography variant="overline" sx={{ display: "block", color: "grey.600", letterSpacing: 1, ...sx }}>
      {title}
    </Typography>
  );
}

function FrameRow({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <Stack
      direction={{ xs: "column", [wide ? "xl" : "md"]: "row" }}
      spacing={3}
      sx={{ alignItems: "flex-start", mt: 1.5, overflowX: "auto", pb: 1 }}
    >
      {children}
    </Stack>
  );
}

function FrameLabel({ children }: { children: ReactNode }) {
  return (
    <Typography
      variant="caption"
      sx={{ display: "block", mb: 0.75, fontFamily: "var(--font-geist-mono), monospace", color: "grey.700" }}
    >
      {children}
    </Typography>
  );
}

/** A genuine 375px viewport — see the file header for why this has to be an iframe. */
function PhoneFrame({ label, src }: { label: string; src: string }) {
  return (
    <Box sx={{ flexShrink: 0 }}>
      <FrameLabel>
        {label} — <strong>375px</strong>
      </FrameLabel>
      <Box
        sx={{
          width: 375 + 12,
          border: "6px solid #18181b",
          borderRadius: 3,
          bgcolor: "#18181b",
          boxShadow: 3,
        }}
      >
        <Box
          component="iframe"
          src={src}
          title={label}
          width={375}
          height={720}
          sx={{ display: "block", border: 0, borderRadius: 1, bgcolor: "background.default" }}
        />
      </Box>
    </Box>
  );
}

/** A genuine desktop-width viewport, fixed rather than left to Brian's own window — see the file header. */
function WideFrame({ label, src }: { label: string; src: string }) {
  return (
    <Box sx={{ flexShrink: 0 }}>
      <FrameLabel>
        {label} — <strong>1024px</strong>
      </FrameLabel>
      <Box sx={{ border: "1px solid", borderColor: "grey.300", borderRadius: 1, overflow: "hidden", boxShadow: 1 }}>
        <Box component="iframe" src={src} title={label} width={1024} height={640} sx={{ display: "block", border: 0 }} />
      </Box>
    </Box>
  );
}
