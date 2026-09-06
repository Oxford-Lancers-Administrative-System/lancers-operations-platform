import { notFound } from "next/navigation";
import Box from "@mui/material/Box";
import { StatusChip } from "@/components/status-chip";
import { Section } from "@/components/section";
import Divider from "@mui/material/Divider";
import Link from "@mui/material/Link";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { todayInClubZone } from "@/lib/club-time";
import { isServiceError } from "@/lib/db";
import { readHolderHistory } from "@/lib/services/administration-audit";
import { earliestEndFor } from "@/lib/services/operator-administration";
import {
  readRoleCatalogue,
  type CatalogueGroup,
  type CatalogueRole,
} from "@/lib/services/administration-directory";
import { operatorAccountState } from "@/lib/services/operator-account-state";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { gateShellPage } from "../../../gate";
import AdminPageHeading from "../../page-heading";
import AdministrationHistory from "../../history";
import { permittedRoleActions } from "../../permissions";
import {
  describePeriod,
  limitsLine,
  NO_CYCLE,
  NOT_ASSIGNED,
  permissionsSummary,
} from "../../presentation";
import RoleActions from "./role-actions";

/**
 * One seat — LAN-133.
 *
 * `REQ-admin-surfaces` names the three things this page presents, and it
 * presents exactly those three: "current holder, a plain-language Permissions
 * summary and holder history".
 *
 * ## The current holder, including when there is not one
 *
 * `DEC-account-state-separation` puts three different situations on this page
 * and each has to read as itself:
 *
 *   * a holder whose operator access is **deactivated** is still the holder,
 *     and the page says so rather than showing a vacancy;
 *   * a successor who is still **Invitation pending** holds the seat "without
 *     capabilities until activation", which is the state chip beside their name;
 *   * **Not assigned** appears only where a role was ended, because only End
 *     role creates a vacancy.
 *
 * ## Permissions
 *
 * `describeRoleCapabilities()` is the projection of the arrays server
 * enforcement reads — `REQ-capability-copy-consistency`, so "a later approved
 * grant change updates authorization and plain-language UI copy together". No
 * sentence on this page is written by hand, and half the catalogue's seats
 * legitimately hold nothing, which is a sentence rather than an empty list.
 *
 * ## The seat itself is not editable
 *
 * `DEC-no-runtime-role-editing`. What the actions below change is who holds it.
 */
export default async function RoleRecordPage({
  params,
}: PageProps<"/operate/admin/roles/[roleId]">) {
  const { roleId } = await params;
  const gate = await gateShellPage(`/operate/admin/roles/${roleId}`, "role_management");
  if ("screen" in gate) return gate.screen;

  let found: { role: CatalogueRole; group: CatalogueGroup; cycleLabel: string } | null = null;
  let history: Awaited<ReturnType<typeof readHolderHistory>> = [];

  try {
    const catalogue = await readRoleCatalogue(gate.operator);
    for (const group of catalogue.groups) {
      const role = group.roles.find((candidate) => candidate.id === roleId);
      if (role) {
        found = {
          role,
          group,
          cycleLabel:
            role.scope === "committee_year"
              ? // LAN-141 finding 8: a gap between committee years is an
                // ordinary Monday, not a reason to refuse the page.
                (catalogue.committeeYear?.label ?? NO_CYCLE.committee_year)
              : (catalogue.season?.label ?? NO_CYCLE.season),
        };
        break;
      }
    }
    if (found) history = await readHolderHistory(gate.operator, found.role.id);
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return <UnavailableScreen title="Role" message={error.message} testId="role-unavailable" />;
  }

  if (!found) notFound();

  const { role, group, cycleLabel } = found;
  const permitted = await permittedRoleActions(
    gate.operator,
    role.code,
    role.holders[0]?.personId ?? null,
  );
  const permissions = permissionsSummary(role.code);
  const limits = limitsLine(role.code);
  // The club's own day, so "today" on this form means the same day the service
  // means by it. `currentDateIn()` is the database's answer and is not reachable
  // from a page; both read Europe/London, which is the whole of the agreement.
  const today = todayInClubZone();

  return (
    <Stack spacing={3}>
      <AdminPageHeading
        title={role.label}
        subtitle={`${group.label} · ${cycleLabel}`}
        back={{ href: "/operate/admin/roles", label: "Back to roles" }}
      />

      <Section title="Current holder" testId="current-holder">
        {role.holders.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {role.scheduled.length > 0
              ? `${NOT_ASSIGNED}. Nobody holds this role today; it has been assigned from a date still to come.`
              : role.cycleMissing
                ? // Scope-aware — LAN-141 finding 8. The ten committee seats
                  // hang off the committee year and have nothing to do with the
                  // season, and telling the Treasurer's reader that no season is
                  // under way answers a question nobody asked.
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
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    data-testid="holder-deactivated"
                  >
                    Their operator access is deactivated. They still hold this role — the seat is
                    not vacant.
                  </Typography>
                ) : null}
              </Box>
            ))}
          </Stack>
        )}

        {/*
          The half the index already showed and this page denied. Brian, on
          finding a seat that read "Not assigned + Alwyn Cholmondley from
          1 Sept 2026" on the index and "Nobody holds this role" here: "That
          doesn't make sense."

          It sits inside the Current holder panel rather than in one of its own,
          because it is part of the answer to "who holds this seat" - the part
          about the near future. It is drawn whether or not the seat is filled:
          a successor lined up behind a departing holder is exactly as much a
          surprise, later, as one lined up behind a vacancy.
        */}
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
      </Section>

      <Section title="Permissions">
        {permissions.empty ? (
          <Typography variant="body2" color="text.secondary" data-testid="permissions">
            {permissions.items[0]}
          </Typography>
        ) : (
          <Box data-testid="permissions">
            <List dense disablePadding>
              {permissions.items.map((item) => (
                <ListItem key={item}>
                  <ListItemText primary={`Can ${item}.`} />
                </ListItem>
              ))}
            </List>
          </Box>
        )}
        {/*
          The negative half — LAN-141 finding 10, and the reviewed prototype's
          own second paragraph. Without it the General Manager and the President
          produced word-for-word identical panels, in the mission whose subtlest
          locked decision is that one outranks the other. Every phrase is
          projected from `PROTECTED_LEADERSHIP_AUTHORITY`, the same table the
          guards read, so it cannot say one thing here and refuse another.
        */}
        {limits ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }} data-testid="limits">
            {limits}
          </Typography>
        ) : null}
      </Section>

      <Section title="Role actions">
        <RoleActions
          roleId={role.id}
          roleCode={role.code}
          roleLabel={role.label}
          vacant={role.vacant}
          assignable={role.assignable}
          admitsMultipleHolders={role.admitsMultipleHolders}
          today={today}
          holders={role.holders.map((holder) => ({
            roleAssignmentId: holder.roleAssignmentId,
            displayName: holder.displayName,
            effectiveFrom: holder.effectiveFrom,
            // The one rule, computed where it is defined — LAN-141 finding 2.
            // The form must not offer a date the service will refuse, and the
            // date it may not offer is decided by the same function the guard
            // uses.
            earliestEnd: earliestEndFor(holder),
          }))}
          permitted={permitted}
        />
      </Section>

      <Box component="section">
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          sx={{ alignItems: { sm: "baseline" }, justifyContent: "space-between", mb: 1.5 }}
        >
          <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>
            Holder history
          </Typography>
          <Typography variant="caption" color="text.secondary">
            This year and past years
          </Typography>
        </Stack>
        <AdministrationHistory
          entries={history}
          emptyMessage={
            role.holders.length > 0 || role.scheduled.length > 0
              ? "No changes to this role have been recorded here. Assignments that came with the club\u2019s records, rather than being made on this screen, appear above."
              : "No changes to this role have been recorded, and nobody is assigned to it."
          }
          testId="holder-history"
          identify="target"
        />
      </Box>
    </Stack>
  );
}
