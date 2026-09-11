import { Section } from "@/components/section";
import { RecordRow as Fact } from "@/components/record-field";
import { NotRecorded } from "@/components/fact";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { PersonRecord } from "@/lib/services/person-record";

/** Provenance is shown only when the record supplies an actor. */
function By({ who }: { who: string | null }) {
  return who ? (
    <Typography component="span" variant="caption" color="text.secondary">
      {" "}
      {who}
    </Typography>
  ) : null;
}

/** The preferred current contact of one kind (and scope), for a labelled row. */
function currentContact(
  record: PersonRecord,
  kind: "email" | "phone",
  scope: "college" | "personal" | null,
) {
  const candidates = record.contacts.filter(
    (contact) => contact.kind === kind && contact.scope === scope && contact.validUntil === null,
  );
  const preferred = candidates.find((contact) => contact.isPreferred) ?? candidates[0];
  return preferred ?? null;
}

/** "Who they are" — name and aliases, always shown. `visible` gates redacted fields. */
export function IdentitySection({
  record,
  visible,
}: {
  record: PersonRecord;
  visible: Partial<PersonRecord>;
}) {
  return (
    <Section variant="banded" band="person" title="Who they are">
      <Fact label="First name" note={record.givenNameSource ?? undefined}>
        {visible.givenName ? <>{record.givenName}</> : <NotRecorded />}
      </Fact>
      <Fact label="Last name" note={record.familyNameSource ?? undefined}>
        {record.familyName !== null ? <>{record.familyName}</> : <NotRecorded />}
      </Fact>
      <Fact label="Aliases">
        {record.aliases.length === 0 ? (
          <NotRecorded />
        ) : (
          <Stack spacing={0.5}>
            {record.aliases.map((alias) => (
              <Box key={alias.id}>
                <Typography component="span" sx={{ fontWeight: alias.isDisplayName ? 700 : 400 }}>
                  {alias.alias}
                </Typography>
                {alias.isDisplayName ? (
                  <Typography component="span" variant="caption" color="text.secondary">
                    {" "}
                    · display name
                  </Typography>
                ) : null}
                <By who={alias.source} />
              </Box>
            ))}
          </Stack>
        )}
      </Fact>
    </Section>
  );
}

/**
 * "How to reach them" — only when `redactPersonRecord` leaves `contacts`
 * visible to this operator's capability grant.
 */
export function ContactSection({
  record,
  currentSeasonLabel,
}: {
  record: PersonRecord;
  currentSeasonLabel: string | null;
}) {
  const mobile = currentContact(record, "phone", null);
  const personalEmail = currentContact(record, "email", "personal");
  const collegeEmail = currentContact(record, "email", "college");
  const unclassifiedEmail = currentContact(record, "email", null);

  return (
    <Section variant="banded" band="person" title="How to reach them">
      <Fact label="Mobile phone" note={mobile?.source ?? undefined}>
        {mobile ? <>{mobile.rawValue}</> : <NotRecorded />}
      </Fact>
      <Fact label={`On WhatsApp${currentSeasonLabel ? ` · ${currentSeasonLabel}` : ""}`}>
        <NotRecorded />
      </Fact>
      <Fact label="Personal email" note={personalEmail?.source ?? undefined}>
        {personalEmail ? <>{personalEmail.rawValue}</> : <NotRecorded />}
      </Fact>
      <Fact label="College email" note={collegeEmail?.source ?? undefined}>
        {collegeEmail ? <>{collegeEmail.rawValue}</> : <NotRecorded />}
      </Fact>
      {/* LAN-257: `contact_points.scope` null means unclassified — the roster's "Email" field leaves it so. Decision history: docs/ux/tickets/LAN-184-people-and-missing-queue.md. */}
      {unclassifiedEmail ? (
        <Fact label="Email · not classified" note={unclassifiedEmail.source ?? undefined}>
          {unclassifiedEmail.rawValue}
        </Fact>
      ) : null}
    </Section>
  );
}
