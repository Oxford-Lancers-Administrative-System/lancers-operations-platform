"use client";

import { useState } from "react";
import { RowCardList } from "@/components/row-card";
import { ControlledSection } from "@/components/controlled-section";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import type { AttendanceParticipant } from "@/lib/services/attendance-vocabulary";
import { AttendanceRow } from "./attendance-row";
import { groupParticipants, type ParticipantGroupKey } from "./presentation";

// The board's three groups, and the disclosure over them — Brian, 14 August 2026.

type GroupOpenState = Record<ParticipantGroupKey, boolean>;

interface OpenState extends GroupOpenState {
  saved: GroupOpenState | null;
  searching: boolean;
}

// Recruits/Attending/Walk-ups open, Everyone else closed — Brian, fidelity mockup.
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
  eventType: string;
  participants: AttendanceParticipant[];
  search: string;
  showMismatch: boolean;
  mayRemove: boolean;
}) {
  const [open, setOpen] = useState<OpenState>(DEFAULT_OPEN);
  const searching = search.trim() !== "";

  // Adjusted during render, not an effect — groups must already be open in
  // the render that first shows the search results.
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
        if (group.participants.length === 0) return null;

        const isOpen = open[group.key];

        return (
          <Box key={group.key} data-testid={`attendance-group-${group.key}`} data-open={isOpen}>
            <ControlledSection
              title={group.label}
              description={group.detail}
              count={group.participants.length}
              open={isOpen}
              onToggle={() => toggle(setOpen, group.key)}
              panelId={`attendance-group-panel-${group.key}`}
              toggleTestId={`attendance-group-toggle-${group.key}`}
              countTestId={`attendance-group-count-${group.key}`}
            >
              <RowCardList component="ul" at="all">
                {group.participants.map((participant) => (
                  <AttendanceRow
                    key={participant.key}
                    eventId={eventId}
                    participant={participant}
                    showMismatch={showMismatch}
                    mayRemove={mayRemove}
                  />
                ))}
              </RowCardList>
            </ControlledSection>
          </Box>
        );
      })}
    </Stack>
  );
}

/** Clears `saved` too — a deliberate open/close during a search is the state to keep. */
function toggle(
  setOpen: (update: (prev: OpenState) => OpenState) => void,
  key: ParticipantGroupKey,
): void {
  setOpen((prev) => ({ ...prev, [key]: !prev[key], saved: null }));
}
