import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { roleLabel } from "@/lib/auth/capabilities";
import type { AdministrationHistoryEntry } from "@/lib/services/administration-audit";
import { formatInstant } from "./presentation";

/**
 * The two audit projections, rendered — LAN-133.
 *
 * `DEC-audit-boundary` and `DEC-administration-language-and-states` between them
 * settle what this is and what it is called. It is **Operator audit history** on
 * an operator's record and **Holder history** on a role's, never a generic
 * "access log" or "audit trail"; the same stored event may appear in both
 * "without duplicate records", which is why one component renders both — two
 * renderings of one event stream is how the two views quietly start disagreeing
 * about what happened.
 *
 * It is a reading surface and nothing else. `DEC-audit-boundary` excludes "the
 * full Stage-4 general audit browser/search/filter/export interface" from this
 * mission, so there is no search box, no date range, no filter and no export
 * here — and their absence is a decision rather than an unfinished edge.
 *
 * ## An entry this version cannot read is shown, not hidden
 *
 * `unreadable` is set when the stored envelope came from a newer version of the
 * application. The service's own note is explicit about why such an entry still
 * arrives: "for an audit surface, a history that *looks* complete and is not is
 * worse than a visible gap, and a row that is simply absent from the list is
 * exactly that". So the row renders with everything that is still legible — when,
 * who, what — and says plainly that the rest cannot be shown.
 */
export default function AdministrationHistory({
  entries,
  emptyMessage,
  testId,
  identify,
}: {
  entries: readonly AdministrationHistoryEntry[];
  emptyMessage: string;
  testId: string;
  /**
   * Which half of each event this surface has to name — LAN-141 finding 7.
   *
   * The service resolves the target's name through a dedicated join and carries
   * the role on every role event, and this component rendered neither. On role
   * detail that made **Holder history** a panel about holders that named no
   * holder: "Role assigned · By Clint Grohmann · 2026-27", three times over,
   * with the past holders it exists to record unrecoverable from it.
   *
   * Each surface already knows one of the two — role detail is one seat,
   * operator detail is one person — so each names the other. Repeating the
   * page's own subject on every row would be noise, and omitting both was the
   * defect.
   */
  identify: "target" | "role";
}) {
  if (entries.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" data-testid={`${testId}-empty`}>
        {emptyMessage}
      </Typography>
    );
  }

  return (
    <Paper variant="outlined" data-testid={testId}>
      <Stack divider={<Box sx={{ borderTop: 1, borderColor: "divider" }} />}>
        {entries.map((entry) => (
          <Box key={entry.id} sx={{ p: 2 }} data-testid="history-entry">
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={{ xs: 0.5, sm: 2 }}
              sx={{ justifyContent: "space-between", alignItems: { sm: "baseline" } }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {entry.label}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {formatInstant(entry.occurredAt)}
              </Typography>
            </Stack>

            {describeSubject(entry, identify) ? (
              <Typography variant="body2" data-testid="history-entry-subject">
                {describeSubject(entry, identify)}
              </Typography>
            ) : null}

            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              {describeActor(entry)}
            </Typography>

            {entry.reason ? (
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {entry.reason}
              </Typography>
            ) : null}

            {entry.unreadable ? (
              <Alert severity="info" sx={{ mt: 1 }} data-testid="history-entry-unreadable">
                {entry.unreadable.message}
              </Alert>
            ) : null}
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}

/**
 * "By Clint Grohmann · 2026-27", and "· backdated" where it applies.
 *
 * The authority the actor held is recorded on every event and is deliberately
 * *not* shown: `REQ-append-only-audit-evidence` requires it to be stored, and
 * `administration-authority.ts` keeps the rule that a surface names the
 * requirement rather than anybody's holdings. Who acted is the club's business;
 * which seats they happened to hold at the time is the record's.
 */
/**
 * Who the entry is about, or which seat it concerns — whichever the surface
 * showing it does not already know. `null` where the stored envelope named
 * neither, which is only ever an entry this version cannot read.
 */
function describeSubject(
  entry: AdministrationHistoryEntry,
  identify: "target" | "role",
): string | null {
  if (identify === "target") return entry.target.name;
  return entry.role ? roleLabel(entry.role.code) : null;
}

function describeActor(entry: AdministrationHistoryEntry): string {
  const parts = [`By ${entry.actor.name}`, entry.operatingYear.label];
  if (entry.backdated) parts.push("backdated");
  return parts.join(" · ");
}
