"use client";

import { useState } from "react";
import type { SxProps, Theme } from "@mui/material/styles";
import Checkbox from "@mui/material/Checkbox";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";

/** Every number the club can issue, 1–99 — `jersey_assignments_number_range`. */
const JERSEY_NUMBERS: readonly string[] = Object.freeze(
  Array.from({ length: 99 }, (_, index) => String(index + 1)),
);

/**
 * The jersey number picker Brian asked to keep exactly — all 99, never free
 * text, another player's number ticked/named/unclickable.
 *
 * Ticking is local, and the whole set is committed once when the picker closes
 * (LAN-380). It used to fire a Server Action on every tick, each one computed
 * from the `held` prop the server had last confirmed: tick three numbers on a
 * slow connection and the second and third were both built on the value before
 * the first, so the first two writes were overwritten and the earlier requests
 * were aborted as the later ones arrived. Reproduced on a production build
 * under a Slow 3G profile — four of five ticks did not land, and the panel
 * said nothing. One opening is now one write, of exactly what is ticked.
 */
export default function JerseyPicker({
  held,
  holders,
  onCommit,
  onClose,
  width,
  sx,
}: {
  held: readonly string[];
  /** Number → the name of whoever holds it this season, this kit. Includes this player's own numbers. */
  holders: Readonly<Record<string, string>>;
  onCommit: (next: string[]) => void;
  onClose: () => void;
  width: number;
  /** What the caller's own surface needs of the closed control — the board sends it the row's height (Brian's visual pass, item 4). */
  sx?: SxProps<Theme>;
}) {
  const [selected, setSelected] = useState<string[]>([...held]);
  const mine = new Set(selected);

  const close = () => {
    const changed =
      selected.length !== held.length || selected.some((number, index) => number !== held[index]);
    if (changed) onCommit(selected);
    onClose();
  };

  return (
    <Select
      size="small"
      open
      multiple
      value={selected}
      onClose={close}
      renderValue={(value) => (value as string[]).join(", ") || "—"}
      sx={[{ width: Math.max(width - 24, 64) }, ...(Array.isArray(sx) ? sx : [sx])]}
      MenuProps={{
        slotProps: { paper: { sx: { maxHeight: 340, width: 260 } } },
      }}
    >
      {JERSEY_NUMBERS.map((number) => {
        const holder = holders[number];
        const isMine = mine.has(number);
        const takenByAnother = holder !== undefined && !isMine;

        return (
          <MenuItem
            key={number}
            value={number}
            disabled={takenByAnother}
            onClick={
              takenByAnother
                ? undefined
                : () => {
                    setSelected((current) =>
                      isMine
                        ? current.filter((entry) => entry !== number)
                        : [...current, number].sort((a, b) => Number(a) - Number(b)),
                    );
                  }
            }
            sx={{ "&.Mui-disabled": { opacity: 1, color: "text.disabled" } }}
          >
            <Checkbox
              size="small"
              sx={{ p: 0, mr: 1 }}
              checked={isMine || takenByAnother}
              disabled={takenByAnother}
              color={takenByAnother ? "default" : "primary"}
            />
            <ListItemText
              primary={number}
              secondary={takenByAnother ? holder : isMine ? "Held — untick to free" : undefined}
              slotProps={{
                primary: {
                  sx: {
                    fontWeight: isMine ? 700 : 500,
                    fontVariantNumeric: "tabular-nums",
                    color: takenByAnother ? "text.disabled" : "text.primary",
                  },
                },
                secondary: { sx: { fontSize: 12 } },
              }}
            />
          </MenuItem>
        );
      })}
    </Select>
  );
}
