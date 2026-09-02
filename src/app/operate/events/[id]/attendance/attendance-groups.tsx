"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { AttendanceParticipant } from "@/lib/services/attendance-vocabulary";
import { AttendanceRow } from "./attendance-row";
import { groupParticipants, type ParticipantGroupKey } from "./presentation";

/**
 * The board's three groups, and the disclosure over them — Brian, 14 August
 * 2026. Which people are in which group, and why there are three, is in
 * `groupParticipants` in `./presentation.ts`; this is only about opening and
 * closing them.
 *
 * ## What is open when
 *
 * **Attending** is open, **Everyone else** is closed, **Walk-ups** is open, and
 * the recorder can change any of them. That is the register's own shape: the
 * people who said they were coming are the list you work through, the rest is a
 * place to go when somebody turns up who should not have, and the walk-ups are
 * the receipt for what you just did.
 *
 * ## Searching opens all of them, and closing the search puts them back
 *
 * A search that only looked inside the section you happened to have open would
 * be a search that lies — the recorder types a name, sees nothing, and concludes
 * the person is not on the event. So while a search is active every group is
 * open regardless of what it was.
 *
 * And when the search is cleared they return to **what they were before it**,
 * not to the default. That is the difference between a disclosure the recorder
 * controls and one that resets itself under them: somebody who deliberately
 * opened Everyone else, searched for a name and cleared the search would
 * otherwise find it shut again.
 *
 * The reconciliation happens during render rather than in an effect, so the
 * groups are already open in the render that first shows the results — see the
 * note beside it.
 *
 * ## Why the groups are computed here and not on the server
 *
 * They are computed in `presentation.ts`, which both sides import; this
 * component calls it. The reason it is called *here* rather than in the page is
 * the search: the page already filters, and grouping the filtered list in one
 * place means the counts beside each heading always describe the rows actually
 * under it. A count computed server-side before filtering would say 14 above a
 * section showing one.
 */

type GroupOpenState = Record<ParticipantGroupKey, boolean>;

interface OpenState extends GroupOpenState {
  /** What to go back to when the search clears. `null` when not searching. */
  saved: GroupOpenState | null;
  /** The search state this was last reconciled against. */
  searching: boolean;
}

/**
 * Recruits open, Attending open, Everyone else closed — and **Walk-ups open**.
 *
 * Recruits is open for the same reason Attending is — Brian, on the fidelity
 * mockup: "recruits open because they are the point of a recruitment event."
 *
 * Walk-ups is not an inconsistency with Everyone else being closed. A walk-up
 * group is empty at almost every event, and an empty group is not drawn at
 * all, so the open state costs nothing until there is something in it. When
 * there is, it is because the recorder just added somebody thirty seconds ago
 * and was returned to this board to see it: closing the only confirmation
 * that the walk-up was recorded would be the one place a disclosure actively
 * hides what the operator did.
 */
const DEFAULT_OPEN: OpenState = {
  recruits: true,
  attending: true,
  everyone_else: false,
  walk_ups: true,
  saved: null,
  searching: false,
};

export function AttendanceGroups({
  eventId,
  eventType,
  participants,
  search,
  showMismatch,
  mayRemove,
}: {
  eventId: string;
  /** Whether to draw the Recruits group at all — `groupParticipants` reads it too. */
  eventType: string;
  /** Already filtered by the page. Grouped and sorted here. */
  participants: AttendanceParticipant[];
  /** The current search text, from the query string. */
  search: string;
  showMismatch: boolean;
  mayRemove: boolean;
}) {
  const [open, setOpen] = useState<OpenState>(DEFAULT_OPEN);
  const searching = search.trim() !== "";

  // Adjusted during render rather than in an effect. React documents this as
  // the way to reconcile state with a changed prop, and it is the right shape
  // here for a reason beyond the lint rule: the groups must already be open in
  // the render that first shows the search results, not opened a frame later.
  // The updater is pure and returns `prev` when nothing applies, so it settles
  // in one pass and is safe under development's double invocation.
  if (open.searching !== searching) {
    setOpen((prev) => {
      if (searching) {
        return {
          recruits: true,
          attending: true,
          everyone_else: true,
          walk_ups: true,
          saved: {
            recruits: prev.recruits,
            attending: prev.attending,
            everyone_else: prev.everyone_else,
            walk_ups: prev.walk_ups,
          },
          searching: true,
        };
      }
      return prev.saved
        ? { ...prev.saved, saved: null, searching: false }
        : { ...prev, searching: false };
    });
  }

  const groups = groupParticipants(participants, eventType);

  return (
    <Stack spacing={2} data-testid="attendance-groups">
      {groups.map((group) => {
        // A group with nobody in it is not rendered at all. Under a filter that
        // is the honest answer — an empty "Attending (0)" heading reads as a
        // team that nobody said yes to — and the page's own filter-empty notice
        // covers the case where both are empty.
        if (group.participants.length === 0) return null;

        const isOpen = open[group.key];

        return (
          <Box key={group.key} data-testid={`attendance-group-${group.key}`} data-open={isOpen}>
            <ButtonBase
              onClick={() => toggle(setOpen, group.key)}
              aria-expanded={isOpen}
              aria-controls={`attendance-group-panel-${group.key}`}
              data-testid={`attendance-group-toggle-${group.key}`}
              sx={{
                width: "100%",
                alignItems: "center",
                justifyContent: "flex-start",
                gap: 1.5,
                px: 1,
                py: 1.5,
                minHeight: 44,
                borderRadius: 1,
                textAlign: "left",
              }}
            >
              {/*
                Drawn rather than typed. The first version used "▸" and "▾", and
                on the real screen the glyphs came out as faint specks — the
                theme's face draws those two characters small and light, and a
                control the recorder is meant to press should not depend on how
                a typeface feels about geometric shapes. One chevron, rotated,
                so it also keeps its weight and width between the two states and
                the heading beside it does not shift as the group opens.
              */}
              <Box
                aria-hidden
                component="svg"
                viewBox="0 0 24 24"
                sx={{
                  flexShrink: 0,
                  width: 22,
                  height: 22,
                  color: "text.primary",
                  transition: (theme) => theme.transitions.create("transform"),
                  transform: isOpen ? "rotate(90deg)" : "none",
                }}
              >
                <path
                  d="M9 5l7 7-7 7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>
                  {group.label}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {group.detail}
                </Typography>
              </Box>
              <Chip
                size="small"
                label={group.participants.length}
                sx={{ ml: "auto" }}
                data-testid={`attendance-group-count-${group.key}`}
              />
            </ButtonBase>

            <Collapse in={isOpen} unmountOnExit>
              <Box
                component="ul"
                id={`attendance-group-panel-${group.key}`}
                sx={{ listStyle: "none", p: 0, m: 0 }}
              >
                {group.participants.map((participant) => (
                  <AttendanceRow
                    key={participant.key}
                    eventId={eventId}
                    participant={participant}
                    showMismatch={showMismatch}
                    mayRemove={mayRemove}
                  />
                ))}
              </Box>
            </Collapse>
          </Box>
        );
      })}
    </Stack>
  );
}

/**
 * Toggles one group.
 *
 * It also clears `saved`, which matters: once the recorder has deliberately
 * opened or closed a section *during* a search, that is the state they want
 * kept, and restoring an older one when the search clears would undo a choice
 * they just made.
 */
function toggle(
  setOpen: (update: (prev: OpenState) => OpenState) => void,
  key: ParticipantGroupKey,
): void {
  setOpen((prev) => ({ ...prev, [key]: !prev[key], saved: null }));
}
