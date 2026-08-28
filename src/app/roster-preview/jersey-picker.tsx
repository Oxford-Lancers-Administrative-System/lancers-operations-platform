"use client";

import Checkbox from "@mui/material/Checkbox";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";

import { JERSEY_NUMBERS } from "./columns";


/**
 * Every number in the kit, and who has it.
 *
 * ## Why this is a picker and not a text field
 *
 * `jersey_assignments_number_range` allows 1–99 and nothing else, so free entry
 * can only ever produce a value the database will refuse. More importantly, a
 * list is the only place the board can tell an operator which numbers are
 * already gone — a text field can say "22 is taken" *after* you type it, which
 * is a worse version of showing you before.
 *
 * ## The rule this enforces
 *
 * A number held by somebody else is shown ticked, named, and **cannot be
 * clicked**. There is no take-it-from-them gesture, deliberately: an assigned
 * number is assigned, and the way to get it is to go to the player who holds
 * it and untick it there. That makes the swap two deliberate acts by an
 * operator who has seen both sides of it, rather than one click that silently
 * strips a number off somebody who is not on screen.
 *
 * The holder's name is on the row precisely so the operator knows where to go.
 *
 * This is the surface form of invariant S2 — the exclusion constraint over
 * `(season, kit, number)` among concurrent assignments. The database would
 * refuse the collision anyway; it would refuse it with a Postgres exclusion
 * violation, which is not something a person can act on.
 *
 * ## What it does not model
 *
 * Effective dating. Unticking here is really "set `effective_to`", and ticking
 * is "open a new assignment" — so the number a player wore last month stays
 * answerable. The mockup drops the whole row instead. Real unassignment
 * preserves history; this does not, and no worker should read it as saying
 * otherwise.
 *
 * `is_predominant` is likewise absent. One number per kit is the one the club
 * reports against, and picking it belongs on player detail with the fuller
 * editor rather than in a grid cell.
 */
export default function JerseyPicker({
  held,
  holders,
  onCommit,
  onClose,
  width,
}: {
  held: readonly string[];
  /** Number → the player holding it. Includes this player's own numbers. */
  holders: ReadonlyMap<string, string>;
  ownerName: string;
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
      renderValue={(value) => (value as string[]).join(", ")}
      sx={{ width: width - 24 }}
      MenuProps={{
        // The scrollable list. Ninety-nine rows is a lot to render and a lot
        // to scroll; it is still the right control, because the operator is
        // looking for a specific number and needs to see its state.
        slotProps: { paper: { sx: { maxHeight: 340, width: 260 } } },
      }}
    >
      {JERSEY_NUMBERS.map((number) => {
        const holder = holders.get(number);
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
            sx={{
              opacity: takenByAnother ? 1 : undefined,
              // A taken row is not greyed into invisibility — the operator has
              // to be able to read the name to know where to go and untick it.
              "&.Mui-disabled": { opacity: 1, color: "text.disabled" },
            }}
          >
            <Checkbox
              size="small"
              sx={{ p: 0, mr: 1 }}
              checked={isMine || takenByAnother}
              disabled={takenByAnother}
              // The tick means "issued", not "issued to the player you are
              // looking at". Colour separates the two.
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
