"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";

// Add players, as a menu of exactly two — LAN-215, `W1-01`, following
// `../events/create-menu.tsx`'s pattern. Labels are Brian's own words
// (`acceptance/W1.md`).

const ADD_PLAYERS_MENU_CHOICES: readonly {
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
