"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";

/**
 * **Create event**, as a menu of exactly two. LAN-155, screen `W3-04`.
 *
 * Brian, 2026-08-21: "Create Event should be Add Single Event, and then Bulk
 * Import. It should be only two options. You should not export the season. That
 * doesn't make sense to be in the proposed column."
 *
 * Two consequences, and both are decisions rather than layout:
 *
 *   * **Importing is here** because it is a way of creating events, so it
 *     belongs under the control that creates them rather than as a third button
 *     competing in the header.
 *   * **Exporting is not here**, because it is not a way of creating anything.
 *     It lives on the bulk import screen, beside the file it produces.
 *
 * This is the only change this work package makes to the Events page. The list,
 * the filters, the period control and the view switch are `W1`'s and are
 * untouched.
 */

export const CREATE_MENU_CHOICES: readonly {
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
