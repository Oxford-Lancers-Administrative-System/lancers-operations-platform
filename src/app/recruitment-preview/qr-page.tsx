"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { Row, Scaffold, Section } from "./chrome";
import { SEASON_LABEL } from "./fixtures";
import type { RecruitmentStore } from "./store";

/**
 * The season's sign-up QR — `W1-04`, and `W10`'s QR half.
 *
 * It is on the recruit board's own page, behind a `QR CODE` button beside `ADD
 * RECRUIT`, because Brian moved it there on 2026-08-31: "The QR code doesn't go
 * here. That doesn't make any damn sense for the QR code to go on the messaging
 * page. It should be on the recruit page… There should still be a separate QR
 * code page… then people can either scan it on their phone, have it as their
 * wallpaper, whatever, and the QR code takes them to the sign-up."
 *
 * **One code, minted once a season.** Per-event codes were considered and
 * dropped: they existed to answer *where did this recruit come from*, and the
 * recruit's own `Came in through` already answers that.
 *
 * Where it points is settled and load-bearing: **straight at the sign-up form**,
 * which the consent model makes the single consent gate. A QR recruit skips the
 * welcome entirely — they are standing at the stand, and the form is the ask.
 */
export default function QrPage({ store, onBack }: { store: RecruitmentStore; onBack: () => void }) {
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const qr = store.qr;

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ justifyContent: "space-between", alignItems: { sm: "flex-start" } }}
      >
        <Box>
          <Typography variant="h6" component="h1">
            Sign-up QR code
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {`Season ${SEASON_LABEL} · scan it, screenshot it, or print it`}
          </Typography>
        </Box>
        <Button variant="outlined" onClick={onBack} sx={{ minHeight: 44 }}>
          Back to recruitment
        </Button>
      </Stack>

      {qr.live ? null : (
        <Alert severity="warning">
          <AlertTitle sx={{ fontWeight: 700 }}>This code is no longer live.</AlertTitle>
          {`Deactivated on ${qr.deactivatedOn}. Anything still carrying it — a poster on a noticeboard, a photograph in somebody's phone — now lands on the uniform invalid page, which says nothing about the club. Mint a new one below.`}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: { xs: 3, md: 5 } }}>
        <Stack spacing={2} sx={{ alignItems: "center", textAlign: "center" }}>
          <QrGlyph live={qr.live} />
          <Typography
            sx={{
              fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
              fontSize: 16,
              color: qr.live ? "text.primary" : "text.disabled",
              textDecoration: qr.live ? "none" : "line-through",
            }}
          >
            {qr.url}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {`${qr.signIns} ${qr.signIns === 1 ? "person has" : "people have"} signed in through it this season`}
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Button variant="contained" disabled={!qr.live} sx={{ minHeight: 44 }}>
              Download
            </Button>
            <Button variant="outlined" disabled={!qr.live} sx={{ minHeight: 44 }}>
              Copy link
            </Button>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 520 }}>
            One code for the whole season. Anyone who scans it lands on the club&rsquo;s own sign-up
            page, and from there in the WhatsApp community group.
          </Typography>
        </Stack>
      </Paper>

      <Section band="recruitment" title="Administration">
        <Row label="Minted">
          <Typography variant="body2">{`${qr.mintedOn} · ${qr.mintedBy}`}</Typography>
        </Row>
        <Row label="Points at" note="The sign-up form, which is the single consent gate.">
          <Typography variant="body2">{qr.url}</Typography>
        </Row>
        <Row label="State">
          <Typography variant="body2">
            {qr.live ? "Live" : `Deactivated ${qr.deactivatedOn}`}
          </Typography>
        </Row>
        <Row label="Sign-ins through this code">
          <Typography variant="body2">{qr.signIns}</Typography>
        </Row>
        <Box sx={{ py: 2 }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Button
              variant="outlined"
              color="warning"
              disabled={!qr.live}
              onClick={() => setConfirmDeactivate(true)}
              sx={{ minHeight: 44 }}
            >
              Deactivate this code
            </Button>
            <Button
              variant="contained"
              disabled={qr.live}
              onClick={store.mintQr}
              sx={{ minHeight: 44 }}
            >
              Mint a new code
            </Button>
          </Stack>
        </Box>
      </Section>

      <Scaffold title="Open, and not invented">
        <Typography variant="body2" color="text.secondary">
          &ldquo;Once per season&rdquo; means something has to mint next season&rsquo;s code.
          Whether that happens automatically at rollover or by a button somebody presses is
          undecided, and Mission 11 owns the season boundary. The <strong>Mint a new code</strong>{" "}
          button above is the second of those two, drawn because a mockup has to do something — it
          is not a recommendation.
        </Typography>
      </Scaffold>

      <Dialog
        open={confirmDeactivate}
        onClose={() => setConfirmDeactivate(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Deactivate this season&rsquo;s code?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {`${qr.signIns} people have already signed in through it. They stay exactly as they are — deactivating a code changes nothing about anybody who used it.`}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Posters and screenshots carrying it will land on the uniform invalid page, which says
            nothing about the club and nothing about whether the code ever existed.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeactivate(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={() => {
              store.deactivateQr();
              setConfirmDeactivate(false);
            }}
            sx={{ minHeight: 44 }}
          >
            Deactivate
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

/**
 * A drawn stand-in, the same shape the approved `W1-04` frame carries.
 *
 * Deliberately not a real encoding: generating one needs a library this
 * dependency tree does not have, and a mockup that shipped a scannable code
 * pointing at a `.example` domain would be worse than one that plainly does
 * not scan.
 */
function QrGlyph({ live }: { live: boolean }) {
  const cells = 7;
  const size = 22;
  const gap = 4;
  const side = cells * size + (cells + 1) * gap;
  // Fixed, so the glyph is identical on every render and in every screenshot.
  const filled = new Set([
    0, 1, 2, 4, 5, 6, 7, 9, 11, 13, 14, 16, 18, 20, 21, 22, 23, 24, 25, 27, 28, 30, 32, 34, 35, 37,
    39, 41, 42, 43, 44, 45, 46, 47,
  ]);
  return (
    <Box
      component="svg"
      role="img"
      aria-label="Placeholder QR code"
      viewBox={`0 0 ${side} ${side}`}
      sx={{ width: 156, height: 156, opacity: live ? 1 : 0.3 }}
    >
      <rect width={side} height={side} fill="#111" />
      {Array.from({ length: cells * cells }, (_, index) => {
        if (!filled.has(index)) return null;
        const row = Math.floor(index / cells);
        const column = index % cells;
        return (
          <rect
            key={index}
            x={gap + column * (size + gap)}
            y={gap + row * (size + gap)}
            width={size}
            height={size}
            fill="#fff"
          />
        );
      })}
    </Box>
  );
}
