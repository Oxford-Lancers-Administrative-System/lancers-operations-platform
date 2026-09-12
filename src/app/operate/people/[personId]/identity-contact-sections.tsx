import { Section } from "@/components/section";
import { RecordRow as Fact } from "@/components/record-field";
import { NotRecorded } from "@/components/fact";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { PersonRecord } from "@/lib/services/person-record";

/**
 * The person record's own sections, shared — LAN-307. The recruit record
 * renders these same components rather than a second, drifting copy of the
 * markup, so a field added here appears on both surfaces at once.
 *
 * Every one of them takes the **redacted** record (`redactPersonRecord`'s
 * `Partial<PersonRecord>`): a field this operator may not see is absent, not
 * `null`, and absent renders exactly as "not recorded" does. The page decides
 * whether a whole section appears; these decide nothing about authority.
 */
export type VisiblePersonRecord = Partial<PersonRecord>;

/** Provenance is shown only when the record supplies an actor. */
function By({ who }: { who: string | null | undefined }) {
  return who ? (
    <Typography component="span" variant="caption" color="text.secondary">
      {" "}
      {who}
    </Typography>
  ) : null;
}

/** The preferred current contact of one kind (and scope), for a labelled row. */
function currentContact(
  record: VisiblePersonRecord,
  kind: "email" | "phone",
  scope: "college" | "personal" | null,
) {
  const candidates = (record.contacts ?? []).filter(
    (contact) => contact.kind === kind && contact.scope === scope && contact.validUntil === null,
  );
  const preferred = candidates.find((contact) => contact.isPreferred) ?? candidates[0];
  return preferred ?? null;
}

/** "Who they are" — name, Known as and aliases. */
export function IdentitySection({ record }: { record: VisiblePersonRecord }) {
  return (
    <Section variant="banded" band="person" title="Who they are">
      <Fact label="First name" note={record.givenNameSource ?? undefined}>
        {record.givenName ? <>{record.givenName}</> : <NotRecorded />}
      </Fact>
      <Fact label="Last name" note={record.familyNameSource ?? undefined}>
        {record.familyName ? <>{record.familyName}</> : <NotRecorded />}
      </Fact>
      {/* LAN-306: its own labelled value, never spliced into the name above. */}
      <Fact label="Known as">{record.knownAs ? <>{record.knownAs}</> : <NotRecorded />}</Fact>
      <Fact label="Aliases">
        {(record.aliases ?? []).length === 0 ? (
          <NotRecorded />
        ) : (
          <Stack spacing={0.5}>
            {(record.aliases ?? []).map((alias) => (
              <Box key={alias.id}>
                <Typography component="span" sx={{ fontWeight: alias.isDisplayName ? 700 : 400 }}>
                  {alias.alias}
                </Typography>
                {alias.isDisplayName ? (
                  <Typography component="span" variant="caption" color="text.secondary">
                    {" "}
                    · known as
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
  record: VisiblePersonRecord;
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
      {/* LAN-257: `contact_points.scope` null means unclassified — the roster's "Email" field leaves it so. */}
      {unclassifiedEmail ? (
        <Fact label="Email · not classified" note={unclassifiedEmail.source ?? undefined}>
          {unclassifiedEmail.rawValue}
        </Fact>
      ) : null}
    </Section>
  );
}

/**
 * The one current mobile a send would go to — LAN-307. The recruit record
 * shows this beside the questionnaire actions so an operator can read the
 * destination before pressing send, rather than opening another page to
 * find out where the message went.
 */
export function recordedMobile(record: VisiblePersonRecord): string | null {
  // Preferred first, any scope, current only — `selectMobileNumber`'s own
  // ordering, so what is shown is what a send would actually pick rather than
  // the narrower scope-`null` row the section above labels "Mobile phone".
  const phones = (record.contacts ?? []).filter(
    (contact) => contact.kind === "phone" && contact.validUntil === null,
  );
  const chosen = phones.find((contact) => contact.isPreferred) ?? phones[0];
  return chosen?.rawValue ?? null;
}
