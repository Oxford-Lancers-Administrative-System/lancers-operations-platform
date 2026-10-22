"use client";

import { useState, type ReactNode } from "react";
import { ControlledSection } from "@/components/controlled-section";

/**
 * LAN-497: one section of the Everyone asked table when it is grouped — the
 * register's collapsible section, its count, and (once the event has occurred)
 * the group's "<attended> attended / <expected> expected", already formatted.
 */
export function ParticipationGroupSection({
  sectionKey,
  label,
  count,
  headline,
  defaultOpen,
  children,
}: {
  sectionKey: string;
  label: string;
  count: number;
  /** The attendance headline, or null before the event has occurred. */
  headline: string | null;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div data-testid={`participation-group-${sectionKey}`} data-open={open}>
      <ControlledSection
        title={label}
        description={headline ?? undefined}
        count={count}
        open={open}
        onToggle={() => setOpen((value) => !value)}
        panelId={`participation-group-panel-${sectionKey}`}
        toggleTestId={`participation-group-toggle-${sectionKey}`}
        countTestId={`participation-group-count-${sectionKey}`}
      >
        {children}
      </ControlledSection>
    </div>
  );
}
