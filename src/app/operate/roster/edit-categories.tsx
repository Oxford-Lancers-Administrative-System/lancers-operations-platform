"use client";

import { useState, useTransition } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { Notice } from "@/components/notice";
import { bandColoursForSwatch, bandOfGroup } from "@/components/band-colours";
import { useRosterGroupColourKeys } from "@/components/band-colours-provider";
import type { RosterGroupKey } from "@/lib/auth/grants";
import { TEMPLATE_COLOUR_PALETTE } from "@/lib/services/event-template-input";
import { bandOf, type Band } from "./board-columns";
import { saveRosterGroupColoursAction } from "./group-colour-actions";

/** The ten groups in the board's own order, each with the name its band prints. */
const BOARD_ORDER: readonly RosterGroupKey[] = Object.freeze([
  "person",
  "onboarding",
  "membership",
  "availability",
  "coaching",
  "offensive",
  "defensive",
  "special_teams",
  "warmup",
  "kit",
]);

const GROUP_ROWS: readonly { group: RosterGroupKey; label: string }[] = Object.freeze(
  BOARD_ORDER.map((group) => ({ group, label: bandOf(bandOfGroup(group) as Band).label })),
);

/** The template editor's swatch: a 14px tint square with a 2px accent edge. */
function Swatch({ colourKey }: { colourKey: string }) {
  const swatch =
    TEMPLATE_COLOUR_PALETTE.find((entry) => entry.key === colourKey) ?? TEMPLATE_COLOUR_PALETTE[0];
  return (
    <Box
      component="span"
      aria-hidden="true"
      sx={{
        display: "inline-block",
        flexShrink: 0,
        width: 14,
        height: 14,
        borderRadius: 0.5,
        bgcolor: swatch.tint,
        border: 2,
        borderColor: swatch.accent,
      }}
    />
  );
}

function colourLabel(colourKey: string): string {
  return TEMPLATE_COLOUR_PALETTE.find((entry) => entry.key === colourKey)?.label ?? colourKey;
}

/**
 * Edit categories — LAN-430, W2-01 and W2-02. The roster's own Add players
 * Button, re-labelled, beside it; it opens the Roster categories dialog: one
 * row per board group, a band preview in the chosen colour and a Select over
 * the palette. Save colours writes all ten at once; a failure keeps the dialog
 * open with the error.
 */
export default function EditCategories() {
  const stored = useRosterGroupColourKeys();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({ ...stored });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const openDialog = () => {
    setDraft({ ...stored });
    setError(null);
    setOpen(true);
  };

  const save = () => {
    startTransition(async () => {
      const result = await saveRosterGroupColoursAction(draft);
      if (result.ok) {
        setOpen(false);
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <>
      <Button
        variant="contained"
        data-testid="edit-categories"
        sx={{ minHeight: 44 }}
        onClick={openDialog}
      >
        Edit categories
      </Button>
      <Dialog
        open={open}
        onClose={pending ? undefined : () => setOpen(false)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="roster-categories-title"
        data-testid="roster-categories-dialog"
      >
        <DialogTitle id="roster-categories-title">Roster categories</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 0.5 }}>
            {error ? (
              <Notice severity="error" testId="roster-categories-error">
                {error}
              </Notice>
            ) : null}
            {GROUP_ROWS.map(({ group, label }) => {
              const colourKey = draft[group];
              const colours = bandColoursForSwatch(colourKey);
              return (
                <Stack
                  key={group}
                  direction={{ xs: "column", sm: "row" }}
                  spacing={{ xs: 1, sm: 2 }}
                  sx={{
                    alignItems: { sm: "center" },
                    pb: 1.5,
                    borderBottom: 1,
                    borderColor: "divider",
                  }}
                  data-testid={`roster-category-${group}`}
                >
                  <Box
                    data-testid={`roster-category-preview-${group}`}
                    data-colour={colourKey}
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      bgcolor: colours.header,
                      color: colours.text,
                      px: 1.5,
                      minHeight: 32,
                      display: "flex",
                      alignItems: "center",
                      borderRadius: 0.5,
                    }}
                  >
                    <Typography variant="overline" sx={{ fontWeight: 700, lineHeight: 1.4 }}>
                      {label}
                    </Typography>
                  </Box>
                  <TextField
                    select
                    size="small"
                    label={`${label} colour`}
                    value={colourKey}
                    disabled={pending}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, [group]: event.target.value }))
                    }
                    sx={{ width: { xs: "100%", sm: 220 } }}
                    slotProps={{
                      select: {
                        renderValue: (value) => (
                          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                            <Swatch colourKey={value as string} />
                            <span>{colourLabel(value as string)}</span>
                          </Stack>
                        ),
                      },
                      htmlInput: { "data-testid": `roster-category-colour-${group}` },
                    }}
                  >
                    {TEMPLATE_COLOUR_PALETTE.map((swatch) => (
                      <MenuItem key={swatch.key} value={swatch.key} data-colour={swatch.key}>
                        <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
                          <Swatch colourKey={swatch.key} />
                          <span>{swatch.label}</span>
                        </Stack>
                      </MenuItem>
                    ))}
                  </TextField>
                </Stack>
              );
            })}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={save}
            disabled={pending}
            data-testid="roster-categories-save"
          >
            Save colours
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
