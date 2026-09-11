import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { StatusChip } from "@/components/status-chip";
import { operatorAccountState } from "@/lib/services/operator-account-state";
import type { CatalogueRole } from "@/lib/services/administration-directory";
import { describePeriod, NOT_ASSIGNED } from "../../presentation";

/**
 * Current holder panel for one role seat — LAN-133.
 *
 * (DEC-account-state-separation, REQ-admin-surfaces).
 */
export default function CurrentHolderPanel({
  role,
  cycleLabel,
}: {
  role: CatalogueRole;
  cycleLabel: string;
}) {
  return (
    <>
      {role.holders.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {role.scheduled.length > 0
            ? `${NOT_ASSIGNED}. Nobody holds this role today; it has been assigned from a date still to come.`
            : role.cycleMissing
              ? // Scope-aware (LAN-141 finding 8): committee seats hang off the committee year, not the season.
                role.scope === "season"
                ? "There is no season under way, so this role has no holder to show yet."
                : "No committee year is recorded as running, so this role has no holder to show yet."
              : `${NOT_ASSIGNED}. Nobody holds this role for ${cycleLabel}, and nobody is due to.`}
        </Typography>
      ) : (
        <Stack spacing={2}>
          {role.holders.map((holder) => (
            <Box key={holder.roleAssignmentId} data-testid="holder">
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}
              >
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {holder.operatorAccountId ? (
                    <Link href={`/operate/admin/operators/${holder.operatorAccountId}`}>
                      {holder.displayName}
                    </Link>
                  ) : (
                    holder.displayName
                  )}
                </Typography>
                {holder.operatorState ? (
                  <StatusChip
                    domain="operator"
                    status={holder.operatorState}
                    label={operatorAccountState(holder.operatorState).label}
                  />
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No operator account
                  </Typography>
                )}
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {describePeriod(holder)}
              </Typography>
              {holder.accessDeactivated ? (
                <Typography variant="body2" color="text.secondary" data-testid="holder-deactivated">
                  Their operator access is deactivated. They still hold this role — the seat is not
                  vacant.
                </Typography>
              ) : null}
            </Box>
          ))}
        </Stack>
      )}

      {/* Near-future successors sit inside this panel, filled or vacant. */}
      {role.scheduled.length > 0 ? (
        <Box sx={{ mt: role.holders.length === 0 ? 1.5 : 2 }} data-testid="scheduled-holders">
          <Divider sx={{ mb: 1.5 }} />
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
            {role.holders.length === 0 ? "Assigned from" : "Also assigned from"}
          </Typography>
          <Stack spacing={1}>
            {role.scheduled.map((entry) => (
              <Box key={entry.roleAssignmentId} data-testid="scheduled-holder">
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {entry.operatorAccountId ? (
                    <Link href={`/operate/admin/operators/${entry.operatorAccountId}`}>
                      {entry.displayName}
                    </Link>
                  ) : (
                    entry.displayName
                  )}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {describePeriod(entry)}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      ) : null}
    </>
  );
}
