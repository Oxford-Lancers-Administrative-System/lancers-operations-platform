"use client";

import { useState, type ReactNode } from "react";
import { ControlledSection } from "@/components/controlled-section";

/**
 * LAN-514, Brian's walk on 31 October: who a message goes (or went) to,
 * closed on arrival and opened to the exact list — the Group by sections'
 * own collapsible section. The closed header still carries the count, and
 * the not-reachable count where the screen shows one.
 */
export function RecipientsSection({
  title,
  description,
  testId,
  children,
}: {
  title: string;
  description?: string;
  testId: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div data-testid={testId} data-open={open}>
      <ControlledSection
        title={title}
        description={description}
        open={open}
        onToggle={() => setOpen((value) => !value)}
        panelId={`${testId}-panel`}
        toggleTestId={`${testId}-toggle`}
      >
        {children}
      </ControlledSection>
    </div>
  );
}
