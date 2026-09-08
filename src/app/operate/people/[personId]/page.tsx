import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { RecordRow as Fact } from "@/components/record-field";
import { NotRecorded } from "@/components/fact";
import { StatusChip } from "@/components/status-chip";
import { SelectField } from "@/components/field";
import { Notice } from "@/components/notice";
import { EmptyState } from "@/components/empty-state";
import { formatDay } from "@/app/operate/roster/presentation";
import { notFound, redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { isServiceError } from "@/lib/db";
import { redactPersonRecord } from "@/lib/auth/person-authority";
import {
  listMergedPredecessors,
  listPersonRoleAssignments,
  listPersonSeasons,
  readPersonHistory,
  resolveMergeSurvivor,
  type PersonHistoryEntry,
} from "@/lib/services/people-directory";
import { readPersonRecord, type PersonRecord } from "@/lib/services/person-record";
import { readCurrentSeason } from "@/lib/services/seasons";
import { gateShellPage } from "../../gate";
import { labelFor, STATUS_LABELS } from "../presentation";
import {
  labelFor as membershipLabelFor,
  MEMBERSHIP_STATUS_LABELS,
} from "../../roster/presentation";

/**
 * `W1-05` … `W1-12` — the person record, its restricted section, its
 * merged-away redirect and its history section. LAN-184, `REQ-person-record`,
 * `REQ-history-on-record`, `REQ-restricted-fields`.
 *
 * ## What is not on this page, and why
 *
 * `person-record.ts`'s `PersonRecord` — the frozen LAN-183 shape this package
 * calls rather than extends — carries `source` for a contact point and for an
 * alias, and for nothing else: `people.given_name`, `family_name`, `college`,
 * `matriculation_year`, `expected_graduation_year`, `degree_field` and
 * `date_of_birth` have no provenance column on `main`, and
 * `person_emergency_contacts.recorded_by_person_id` exists in the schema but
 * is not part of what `readPersonRecord()` returns.
 *
 * `Q-13` (Brian's walkthrough of this page at 2934b787, 2026-08-29): for
 * those same seven fields, `readPersonRecord()` now derives "who supplied it"
 * from `audit_events` instead of a stored column — the most recent
 * `person_<field>_updated` row `person-write.ts`'s `updatePersonField` wrote
 * naming this person. `DerivedBy` below renders that name where one was
 * found, and reads "not recorded" — plainly, not silently — where it was
 * not: a value that arrived by seed or import and was never edited through
 * the application has no such row. Almost nothing has been changed through
 * the application yet, so this renders sparsely today and becomes truthful as
 * the club uses it; that is the intended shape, not a gap. Inventing a
 * caption the data cannot back is still the false statement amendment
 * `W1-A2` struck the `Verified` mark for being — reading one back out of the
 * record's own history is not that. The emergency contact keeps carrying no
 * caption at all: its `recorded_by_person_id` column is real but still not
 * part of what this package reads, and stays a later package's decision.
 *
 * ## Redaction, applied even though nothing here can exercise it today
 *
 * `redactPersonRecord()` runs on every load. `person_record_authority` is
 * currently all-or-nothing — every category reads the same capability — so
 * `visible` equals `record` for every operator who reaches this page at all.
 * It runs anyway because `REQ-authority`'s "column visibility is a function
 * of category grants" is a property of this page's *code*, not of today's
 * capability map, and the day a coaching seat is granted `"contact"` this is
 * the line that has to already be here.
 */

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

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

export default async function PersonRecordPage({
  params,
  searchParams,
}: PageProps<"/operate/people/[personId]">) {
  const { personId } = await params;
  const gate = await gateShellPage(`/operate/people/${personId}`, "person_record_authority");
  if ("screen" in gate) return gate.screen;

  let record: PersonRecord;
  try {
    record = await readPersonRecord(personId);
  } catch (error) {
    if (isServiceError(error) && error.kind === "not_found") {
      if (error.rule === "person_merged_away") {
        const survivorId = await resolveMergeSurvivor(personId);
        if (survivorId) redirect(`/operate/people/${survivorId}`);
      }
      notFound();
    }
    throw error;
  }

  const visible = redactPersonRecord(
    record as unknown as Record<string, unknown>,
    gate.operator.roleCodes,
  ) as unknown as Partial<PersonRecord>;

  const [predecessors, roles, seasons, history, currentSeason] = await Promise.all([
    listMergedPredecessors(personId),
    listPersonRoleAssignments(personId),
    listPersonSeasons(personId),
    readPersonHistory(personId),
    readCurrentSeason().catch(() => null),
  ]);

  const sp = await searchParams;
  const historyExpanded = first(sp.history) === "expanded";
  const historyField = first(sp.field);
  const historyActor = first(sp.actor);

  const fields = Array.from(new Set(history.map((entry) => entry.field))).sort();
  const actors = Array.from(new Set(history.map((entry) => entry.actorDisplayName))).sort();
  const filteredHistory = history.filter(
    (entry) =>
      (historyField === "" || entry.field === historyField) &&
      (historyActor === "" || entry.actorDisplayName === historyActor),
  );

  const mobile = currentContact(record, "phone", null);
  const personalEmail = currentContact(record, "email", "personal");
  const collegeEmail = currentContact(record, "email", "college");

  const currentRoles = roles.filter((role) => !role.hasEnded);
  const clubRoleSummary =
    record.status === "recruit"
      ? "Recruit"
      : record.status === "onboarding" ||
          record.status === "active" ||
          record.status === "inactive" ||
          record.status === "departed" ||
          record.status === "archived"
        ? ["Player", ...currentRoles.map((role) => role.roleName)].join(" · ")
        : currentRoles.length > 0
          ? currentRoles.map((role) => role.roleName).join(" · ")
          : null;

  const everHeldMembership = seasons.length > 0;
  const alumniLabel = record.isPastMember
    ? "Alumnus"
    : everHeldMembership
      ? "Current member"
      : "Never a member";

  return (
    <Stack spacing={3}>
      <PageHeader
        title={record.displayName}
        subtitle={clubRoleSummary}
        back={{ href: "/operate/people", label: "Back to people" }}
        status={
          record.status !== null ? (
            <StatusChip
              domain={record.status === "recruit" ? "personType" : "membership"}
              status={record.status}
              label={labelFor(STATUS_LABELS, record.status)}
            />
          ) : undefined
        }
        actions={
          <>
            <Button variant="outlined" href={`/operate/people/${personId}/edit`}>
              Correct this record
            </Button>
            <Button href={`/operate/people/${personId}/merge`}>Merge…</Button>
          </>
        }
      />

      {predecessors.map((predecessor) => (
        <Notice key={predecessor.personId} severity="info" testId="merge-notice">
          &ldquo;{predecessor.displayName}&rdquo; was merged into this record on{" "}
          {predecessor.mergedAt.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          {predecessor.mergedByDisplayName ? ` by ${predecessor.mergedByDisplayName}` : ""}.
        </Notice>
      ))}

      {record.missingRequiredFields.length > 0 ? (
        <Notice severity="warning" testId="record-missing-banner">
          {record.missingRequiredFields.length} required{" "}
          {record.missingRequiredFields.length === 1 ? "fact is" : "facts are"} missing.
        </Notice>
      ) : null}

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

      {visible.contacts !== undefined ? (
        <Section variant="banded" band="person" title="How to reach them">
          <Fact label="Mobile phone" note={mobile?.source ?? undefined}>
            {mobile ? <>{mobile.rawValue}</> : <NotRecorded />}
          </Fact>
          <Fact label={`On WhatsApp${currentSeason ? ` · ${currentSeason.label}` : ""}`}>
            <NotRecorded />
          </Fact>
          <Fact label="Personal email" note={personalEmail?.source ?? undefined}>
            {personalEmail ? <>{personalEmail.rawValue}</> : <NotRecorded />}
          </Fact>
          <Fact label="College email" note={collegeEmail?.source ?? undefined}>
            {collegeEmail ? <>{collegeEmail.rawValue}</> : <NotRecorded />}
          </Fact>
        </Section>
      ) : null}

      {visible.college !== undefined ? (
        <Section variant="banded" band="person" title="Academic">
          <Fact label="College" note={record.collegeSource ?? undefined}>
            {record.college !== null ? <>{record.college}</> : <NotRecorded />}
          </Fact>
          <Fact label="Matriculation year" note={record.matriculationYearSource ?? undefined}>
            {record.matriculationYear !== null ? <>{record.matriculationYear}</> : <NotRecorded />}
          </Fact>
          <Fact label="Expected graduation" note={record.expectedGraduationYearSource ?? undefined}>
            {record.expectedGraduationYear !== null ? (
              <>{record.expectedGraduationYear}</>
            ) : (
              <NotRecorded />
            )}
          </Fact>
          <Fact label="Degree field" note={record.degreeFieldSource ?? undefined}>
            {record.degreeField !== null ? <>{record.degreeField}</> : <NotRecorded />}
          </Fact>
        </Section>
      ) : null}

      {visible.dateOfBirth !== undefined ? (
        <Section variant="banded" band="person" title="Restricted">
          <Fact label="Date of birth" note={record.dateOfBirthSource ?? undefined}>
            {record.dateOfBirth !== null ? <>{formatDay(record.dateOfBirth)}</> : <NotRecorded />}
          </Fact>
          <Fact label="Under 18">
            {record.isUnder18 === null ? <NotRecorded /> : record.isUnder18 ? "Yes" : "No"}
          </Fact>
          <Fact label="Emergency contact">
            {record.emergencyContact ? (
              <Stack>
                <span>
                  {record.emergencyContact.givenName}
                  {record.emergencyContact.familyName
                    ? ` ${record.emergencyContact.familyName}`
                    : ""}
                  {record.emergencyContact.relationship
                    ? ` · ${record.emergencyContact.relationship}`
                    : ""}
                </span>
                <span>
                  {[record.emergencyContact.phone, record.emergencyContact.email]
                    .filter(Boolean)
                    .join(" · ") || <NotRecorded />}
                </span>
              </Stack>
            ) : (
              <NotRecorded />
            )}
          </Fact>
        </Section>
      ) : null}

      {visible.status !== undefined ? (
        <Section variant="banded" band="person" title="Where they stand">
          <Fact label="Status">
            {record.status !== null ? (
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
            </Stack>
          </Fact>
        </Section>
      ) : null}

      <Section variant="banded" band="season" title="Their seasons">
        {seasons.length === 0 ? (
          <Typography color="text.secondary">None</Typography>
        ) : (
          <Stack>
            {seasons.map((season) => (
              <Stack
                key={season.membershipId}
                direction="row"
                spacing={2}
                sx={{
                  justifyContent: "space-between",
                  alignItems: "center",
                  py: 1.25,
                  borderBottom: 1,
                  borderColor: "divider",
                  "&:last-child": { borderBottom: 0 },
                }}
              >
                <Button
                  href={`/operate/roster/${season.membershipId}`}
                  sx={{ p: 0, minHeight: 0, textTransform: "none", fontWeight: 600 }}
                >
                  {season.seasonLabel}
                </Button>
                <StatusChip
                  domain="membership"
                  status={season.status}
                  label={membershipLabelFor(MEMBERSHIP_STATUS_LABELS, season.status)}
                />
              </Stack>
            ))}
          </Stack>
        )}
      </Section>

      <Section
        collapsible
        defaultOpen={historyExpanded}
        title={`What changed${historyExpanded ? ` · ${filteredHistory.length} of ${history.length}` : ""}`}
        action={
          historyExpanded ? (
            <Button
              href={`/operate/people/${personId}`}
              sx={{ p: 0, minHeight: 0, textTransform: "none" }}
            >
              Collapse
            </Button>
          ) : (
            <Button
              href={`/operate/people/${personId}?history=expanded`}
              sx={{ p: 0, minHeight: 0, textTransform: "none" }}
              data-testid="history-show-all"
            >
              Show all {history.length} →
            </Button>
          )
        }
      >
        {historyExpanded ? (
          <Stack spacing={2}>
            <Box
              component="form"
              method="get"
              action={`/operate/people/${personId}`}
              data-testid="history-filters"
            >
              <input type="hidden" name="history" value="expanded" />
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <SelectField
                  name="field"
                  label="Field"
                  defaultValue={historyField}
                  options={[
                    { value: "", label: "All" },
                    ...fields.map((field) => ({ value: field, label: field })),
                  ]}
                />
                <SelectField
                  name="actor"
                  label="Changed by"
                  defaultValue={historyActor}
                  options={[
                    { value: "", label: "All" },
                    ...actors.map((actor) => ({ value: actor, label: actor })),
                  ]}
                />
                <Button
                  type="submit"
                  variant="outlined"
                  sx={{ minHeight: 44, alignSelf: "flex-start" }}
                >
                  Apply
                </Button>
              </Stack>
            </Box>
            {filteredHistory.length === 0 ? (
              <EmptyState
                title="No changes match these filters."
                action={{
                  href: `/operate/people/${personId}?history=expanded`,
                  label: "Clear filters",
                }}
              />
            ) : (
              <Stack>
                {filteredHistory.map((entry) => (
                  <HistoryRow key={entry.id} entry={entry} />
                ))}
              </Stack>
            )}
          </Stack>
        ) : (
          <Stack>
            {history.slice(0, 3).map((entry) => (
              <HistoryRow key={entry.id} entry={entry} />
            ))}
            {history.length === 0 ? (
              <Typography color="text.secondary">None recorded.</Typography>
            ) : null}
          </Stack>
        )}
      </Section>
    </Stack>
  );
}

function HistoryRow({ entry }: { entry: PersonHistoryEntry }) {
  return (
    <Box
      sx={{
        py: 1.25,
        borderBottom: 1,
        borderColor: "divider",
        "&:last-child": { borderBottom: 0 },
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {entry.summary}
      </Typography>
      {entry.fromValue !== null || entry.toValue !== null ? (
        <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
          <Typography
            component="span"
            color="text.secondary"
            sx={{ textDecoration: "line-through" }}
          >
            {entry.fromValue ?? "not recorded"}
          </Typography>{" "}
          → <Typography component="span">{entry.toValue ?? <NotRecorded />}</Typography>
        </Typography>
      ) : null}
      <Typography variant="caption" color="text.secondary" component="div">
        {entry.occurredAt.toLocaleString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}{" "}
        · {entry.actorDisplayName}
      </Typography>
      {entry.reason ? (
        <Typography variant="caption" color="text.secondary" component="div">
          Reason: {entry.reason}
        </Typography>
      ) : null}
    </Box>
  );
}
