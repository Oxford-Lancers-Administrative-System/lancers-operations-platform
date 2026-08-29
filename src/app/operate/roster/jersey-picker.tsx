"use client";

import Checkbox from "@mui/material/Checkbox";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";

/** Every number the club can issue, 1–99 — `jersey_assignments_number_range`. */
export const JERSEY_NUMBERS: readonly string[] = Object.freeze(
  Array.from({ length: 99 }, (_, index) => String(index + 1)),
);

/**
 * The jersey number picker Brian approved on `chore/roster-fidelity-mockup`
 * and asked to keep exactly: *"jersey number being a picker and not free text
 * is also very good, and it should allow for picking multiple numbers… I love
 * the way it's built. I want to keep that exactly."*
 *
 * A picker over all 99 numbers, never free text — `jersey_assignments_number_range`
 * allows 1–99 and nothing else, so free entry could only ever produce a value
 * the database refuses, and a list is the only place that can say which
 * numbers are already gone *before* one is chosen rather than after (`Q-8`).
 *
 * A number held by another player is ticked, named, and cannot be clicked.
 * There is deliberately no take-it-from-them gesture: to free a number, an
 * operator goes to the player holding it and unticks it there, which makes a
 * swap two deliberate acts by somebody who has seen both sides of it rather
 * than one click that strips a number off somebody not on screen.
 */
export default function JerseyPicker({
  held,
  holders,
  onCommit,
  onClose,
  width,
}: {
  held: readonly string[];
  /** Number → the name of whoever holds it this season, this kit. Includes this player's own numbers. */
  holders: Readonly<Record<string, string>>;
  onCommit: (next: string[]) => void;
  onClose: () => void;
  width: number;
}) {
  const mine = new Set(held);

  return (
    <Select
      size="small"
      open
      multiple
      value={held as string[]}
      onClose={onClose}
      renderValue={(value) => (value as string[]).join(", ") || "—"}
      sx={{ width: Math.max(width - 24, 64) }}
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
                    const next = isMine
                      ? held.filter((entry) => entry !== number)
                      : [...held, number].sort((a, b) => Number(a) - Number(b));
                    onCommit(next);
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
