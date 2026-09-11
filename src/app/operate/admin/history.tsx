import { Notice } from "@/components/notice";
import Box from "@mui/material/Box";
import { RowCard, RowCardList } from "@/components/row-card";
import { EmptyState } from "@/components/empty-state";
import { roleLabel } from "@/lib/auth/capabilities";
import type { AdministrationHistoryEntry } from "@/lib/services/administration-audit";
import { formatInstant } from "./presentation";

// The two audit projections, rendered — LAN-133. A reading surface only.
// Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md.
export default function AdministrationHistory({
  entries,
  emptyMessage,
  testId,
  identify,
}: {
  entries: readonly AdministrationHistoryEntry[];
  emptyMessage: string;
  testId: string;
  /** Which half of each event this surface names, the other being already known — LAN-141 finding 7. */
  identify: "target" | "role";
}) {
  if (entries.length === 0) {
    return <EmptyState title={emptyMessage} testId={`${testId}-empty`} />;
  }

  return (
    <RowCardList at="all" testId={testId}>
      {entries.map((entry) => (
        <RowCard
          key={entry.id}
          testId="history-entry"
          title={entry.label}
          sublines={[
            formatInstant(entry.occurredAt),
            describeSubject(entry, identify) ? (
              <Box key="subject" data-testid="history-entry-subject">
                {describeSubject(entry, identify)}
              </Box>
            ) : null,
            describeActor(entry),
            entry.reason,
            entry.unreadable ? (
              <Notice key="unreadable" severity="info" testId="history-entry-unreadable">
                {entry.unreadable.message}
              </Notice>
            ) : null,
          ].filter(Boolean)}
        />
      ))}
    </RowCardList>
  );
}

function describeSubject(
  entry: AdministrationHistoryEntry,
  identify: "target" | "role",
): string | null {
  if (identify === "target") return entry.target.name;
  return entry.role ? roleLabel(entry.role.code) : null;
}

/** The actor's authority at the time is deliberately not shown — `REQ-append-only-audit-evidence` records it, never displays it. Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md. */
function describeActor(entry: AdministrationHistoryEntry): string {
  const parts = [`By ${entry.actor.name}`, entry.operatingYear.label];
  if (entry.backdated) parts.push("backdated");
  return parts.join(" · ");
}
