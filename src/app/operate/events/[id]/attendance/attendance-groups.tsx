"use client";

import { useState } from "react";
import { RowCardList } from "@/components/row-card";
import { ControlledSection } from "@/components/controlled-section";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import type { AttendanceParticipant } from "@/lib/services/attendance-vocabulary";
import type { AttendanceGroupFamily } from "@/lib/services/attendance-group-by";
import { AttendanceRow } from "./attendance-row";
import { registerSections, type RegisterSection } from "./presentation";

// The board's sections, and the disclosure over them — Brian, 14 August 2026.
// LAN-497: with a Group by family chosen, the sections are that family's values.

type OpenMap = Record<string, boolean>;

interface OpenState {
  /** What has been set, by a search or a toggle. A section absent here is at its default. */
  open: OpenMap;
  /** The state before a search opened everything, restored when the search ends. */
  saved: OpenMap | null;
  searching: boolean;
}

const INITIAL: OpenState = { open: {}, saved: null, searching: false };

function isOpen(state: OpenState, section: RegisterSection): boolean {
  return state.open[section.key] ?? (state.searching ? true : section.defaultOpen);
}

function snapshot(state: OpenState, sections: readonly RegisterSection[]): OpenMap {
  return Object.fromEntries(sections.map((section) => [section.key, isOpen(state, section)]));
}

/** The caller remounts this (a `key` per family) so a new family starts from its own defaults. */
export function AttendanceGroups({
  eventId,
  eventType,
  participants,
  search,
  showMismatch,
  mayRemove,
  groupBy = null,
}: {
  eventId: string;
  eventType: string;
  participants: AttendanceParticipant[];
  search: string;
  showMismatch: boolean;
  mayRemove: boolean;
  groupBy?: AttendanceGroupFamily | null;
}) {
  const [state, setState] = useState<OpenState>(INITIAL);
  const searching = search.trim() !== "";
  const sections = registerSections(participants, eventType, groupBy);

  // Adjusted during render, not an effect — sections must already be open in
  // the render that first shows the search results.
  if (state.searching !== searching) {
    setState((prev) => {
      if (searching) return { open: {}, saved: snapshot(prev, sections), searching: true };
      return prev.saved
        ? { open: prev.saved, saved: null, searching: false }
        : { open: snapshot(prev, sections), saved: null, searching: false };
    });
  }

  return (
    <Stack spacing={2} data-testid="attendance-groups" data-group-by={groupBy ?? "none"}>
      {sections.map((section) => {
        if (section.participants.length === 0) return null;

        const open = isOpen(state, section);

        return (
          <Box key={section.key} data-testid={`attendance-group-${section.key}`} data-open={open}>
            <ControlledSection
              title={section.label}
              description={section.detail}
              count={section.participants.length}
              open={open}
              onToggle={() =>
                // Clears `saved` too — a deliberate open/close during a search is the state to keep.
                setState((prev) => ({
                  ...prev,
                  open: { ...prev.open, [section.key]: !isOpen(prev, section) },
                  saved: null,
                }))
              }
              panelId={`attendance-group-panel-${section.key}`}
              toggleTestId={`attendance-group-toggle-${section.key}`}
              countTestId={`attendance-group-count-${section.key}`}
            >
              <RowCardList component="ul" at="all">
                {section.participants.map((participant) => (
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
