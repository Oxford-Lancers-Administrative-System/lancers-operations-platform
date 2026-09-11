"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";

// Create event, as a menu of exactly two — LAN-155, `W3-04`, Brian 2026-08-21.

const CREATE_MENU_CHOICES: readonly {
  href: string;
  label: string;
  detail: string;
}[] = Object.freeze([
  Object.freeze({
    href: "/operate/events/new",
    label: "Add a single event",
    detail: "One fixture, practice or social",
  }),
  Object.freeze({
    href: "/operate/events/import",
    label: "Bulk import",
    detail: "A term’s worth at once",
  }),
]);

export default function CreateEventMenu() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  return (
    <>
      <Button
        variant="contained"
        id="create-event-button"
        aria-haspopup="menu"
        aria-controls={anchor === null ? undefined : "create-event-menu"}
        aria-expanded={anchor === null ? undefined : "true"}
        data-testid="create-event"
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        Create event
      </Button>
      <Menu
        id="create-event-menu"
        anchorEl={anchor}
        open={anchor !== null}
        onClose={() => setAnchor(null)}
        slotProps={{ list: { "aria-labelledby": "create-event-button" } }}
      >
        {CREATE_MENU_CHOICES.map((choice) => (
          <MenuItem
            key={choice.href}
            href={choice.href}
            component="a"
            data-testid={`create-${choice.href.split("/").pop()}`}
            onClick={() => setAnchor(null)}
          >
            <ListItemText primary={choice.label} secondary={choice.detail} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
