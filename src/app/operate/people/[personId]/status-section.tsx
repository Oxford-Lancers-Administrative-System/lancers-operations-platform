import { Section } from "@/components/section";
import { RecordRow as Fact } from "@/components/record-field";
import { NotRecorded } from "@/components/fact";
import { StatusChip } from "@/components/status-chip";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { PersonRoleAssignment } from "@/lib/services/people-directory";
import type { VisiblePersonRecord } from "./identity-contact-sections";
import { labelFor, STATUS_LABELS } from "../presentation";

/** "Where they stand" — status, alumni standing and role assignments. */
export default function StatusSection({
  record,
  roles,
  alumniLabel,
  mayAssignRole,
}: {
  record: VisiblePersonRecord;
  roles: readonly PersonRoleAssignment[];
  alumniLabel: string;
  /** LAN-423: the link's target needs `role_management`, so only its holders see it. */
  mayAssignRole: boolean;
}) {
  return (
    <Section variant="banded" band="person" title="Where they stand">
      <Fact label="Status">
        {record.status != null ? (
          <StatusChip
            domain={record.status === "recruit" ? "personType" : "membership"}
            status={record.status}
            label={labelFor(STATUS_LABELS, record.status)}
          />
        ) : (
          <NotRecorded />
        )}
      </Fact>
      <Fact label="Alumni standing">
        {alumniLabel}
        {record.standingIsOverridden ? (
          <Typography component="span" variant="caption" color="text.secondary">
            {" "}
            · Override
          </Typography>
        ) : null}
      </Fact>
      <Fact label="Roles">
        <Stack spacing={0.5}>
          {roles.length === 0 ? (
            <NotRecorded />
          ) : (
            roles.map((role, index) => (
              <Box key={`${role.roleName}-${role.cycleLabel}-${index}`}>
                {role.roleName} · {role.cycleLabel}
                {role.hasEnded ? (
                  <Typography component="span" variant="caption" color="text.secondary">
                    {" "}
                    · ended
                  </Typography>
                ) : null}
              </Box>
            ))
          )}
          {mayAssignRole ? (
            <Button
              href="/operate/admin/roles"
              sx={{
                p: 0,
                minHeight: 0,
                textTransform: "none",
                justifyContent: "flex-start",
                width: "fit-content",
              }}
            >
              Assign a role →
            </Button>
          ) : null}
        </Stack>
      </Fact>
    </Section>
  );
}
