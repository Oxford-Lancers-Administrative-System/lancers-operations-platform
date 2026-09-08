"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";

/**
 * **Add players**, as a menu of exactly two. LAN-215, screen `W1-01`.
 *
 * The Events page already carries a menu of this shape
 * (`../events/create-menu.tsx`, LAN-155), and the Linear issue for this
 * package names it directly as the surface to follow rather than invent a
 * second one. This component is that pattern, retitled for the roster's own
 * two doors.
 *
 * The two labels are Brian's own words, not this package's to improve —
 * `acceptance/W1.md`'s "Menu wording" correction, taken before W1's approval:
 * "Add one player by hand" became **Add one player**, and "Import last
 * season's squad" became **Bulk import players**.
 *
 * Both destinations sit behind their own authority: `/operate/roster/new`
 * stays at the shipped general-operator floor (W2), and
 * `/operate/roster/import` is four-role (W1, `roster_bulk_import`) — this
 * menu draws no distinction between the two entries, because a hidden or
 * disabled item here would be a courtesy, never the boundary. Each
 * destination's own page and service guard again.
 */

export const ADD_PLAYERS_MENU_CHOICES: readonly {
  href: string;
  label: string;
  detail: string;
}[] = Object.freeze([
  Object.freeze({
    href: "/operate/roster/new",
    label: "Add one player",
    detail: "One person, by hand",
  }),
  Object.freeze({
    href: "/operate/roster/import",
    label: "Bulk import players",
    detail: "A CSV of last season's squad",
  }),
]);

export default function AddPlayersMenu() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  return (
    <>
      <Button
        variant="contained"
        id="add-players-button"
        aria-haspopup="menu"
        aria-controls={anchor === null ? undefined : "add-players-menu"}
        aria-expanded={anchor === null ? undefined : "true"}
        data-testid="add-players"
        sx={{ minHeight: 44 }}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        Add players
      </Button>
      <Menu
        id="add-players-menu"
        anchorEl={anchor}
        open={anchor !== null}
        onClose={() => setAnchor(null)}
        slotProps={{ list: { "aria-labelledby": "add-players-button" } }}
      >
        {ADD_PLAYERS_MENU_CHOICES.map((choice) => (
          <MenuItem
            key={choice.href}
            href={choice.href}
            component="a"
            data-testid={`add-players-${choice.href.split("/").pop()}`}
            onClick={() => setAnchor(null)}
          >
            <ListItemText primary={choice.label} secondary={choice.detail} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
