"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";

// Add recruits, as a menu of two — LAN-487: Add recruit and Import recruits,
// in the roster's Add players menu pattern (`../roster/add-players-menu.tsx`).

const ADD_RECRUITS_MENU_CHOICES: readonly { href: string; label: string; detail: string }[] =
  Object.freeze([
    Object.freeze({
      href: "/operate/recruitment/new",
      label: "Add recruit",
      detail: "One person, by hand",
    }),
    Object.freeze({
      href: "/operate/recruitment/import",
      label: "Import recruits",
      detail: "A CSV of recruits",
    }),
  ]);

export default function AddRecruitsMenu({ testId }: { testId?: string }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const id = testId ?? "add-recruits";

  return (
    <>
      <Button
        variant="contained"
        id={`${id}-button`}
        aria-haspopup="menu"
        aria-controls={anchor === null ? undefined : `${id}-menu`}
        aria-expanded={anchor === null ? undefined : "true"}
        data-testid={testId}
        sx={{ minHeight: 44 }}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        ADD RECRUITS
      </Button>
      <Menu
        id={`${id}-menu`}
        anchorEl={anchor}
        open={anchor !== null}
        onClose={() => setAnchor(null)}
        slotProps={{ list: { "aria-labelledby": `${id}-button` } }}
      >
        {ADD_RECRUITS_MENU_CHOICES.map((choice) => (
          <MenuItem
            key={choice.href}
            href={choice.href}
            component="a"
            data-testid={`add-recruits-${choice.href.split("/").pop()}`}
            onClick={() => setAnchor(null)}
          >
            <ListItemText primary={choice.label} secondary={choice.detail} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
