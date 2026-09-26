import { Notice } from "@/components/notice";
import Box from "@mui/material/Box";
import { RowCard, RowCardList } from "@/components/row-card";
import { EmptyState } from "@/components/empty-state";
import { roleLabel } from "@/lib/auth/capabilities";
import type { AdministrationHistoryEntry } from "@/lib/services/administration-audit";
import { accessHistoryLines, accessHistoryTitle, formatInstant } from "./presentation";

// The two audit projections, rendered — LAN-133. A reading surface only.
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
      {entries.map((entry) => {
        // LAN-430: an access change says what changed — one line for a press,
        // a list under the actor for a copy or Grant everything (W1-03, W1-08).
        const changes = accessHistoryLines(entry);
        const inline = entry.action === "administration.access.changed";
        return (
          <RowCard
            key={entry.id}
            testId="history-entry"
            title={accessHistoryTitle(entry)}
            sublines={[
              formatInstant(entry.occurredAt),
              describeSubject(entry, identify) ? (
                <Box key="subject" data-testid="history-entry-subject">
                  {describeSubject(entry, identify)}
                </Box>
              ) : null,
              inline && changes.length > 0 ? (
                <Box key="change" data-testid="history-entry-change">
                  {changes[0]}
                </Box>
              ) : null,
              describeActor(entry),
              !inline && changes.length > 0 ? (
                <Box
                  key="changes"
                  component="ul"
                  data-testid="history-entry-changes"
                  sx={{ m: 0, mt: 1, pt: 1, pl: 1.5, borderTop: 1, borderColor: "divider" }}
                >
                  {changes.map((line) => (
                    <Box key={line} component="li" sx={{ listStyle: "none" }}>
                      {line}
                    </Box>
                  ))}
                </Box>
              ) : null,
              entry.reason,
              entry.unreadable ? (
                <Notice key="unreadable" severity="info" testId="history-entry-unreadable">
                  {entry.unreadable.message}
                </Notice>
              ) : null,
            ].filter(Boolean)}
          />
        );
      })}
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

/** The actor's authority at the time is deliberately not shown — `REQ-append-only-audit-evidence` records it, never displays it. */
function describeActor(entry: AdministrationHistoryEntry): string {
  const parts = [`By ${entry.actor.name}`, entry.operatingYear.label];
  if (entry.backdated) parts.push("backdated");
  return parts.join(" · ");
}
