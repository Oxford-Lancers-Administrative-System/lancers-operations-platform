import { notFound, redirect } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
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
import {
  readLatestPersonFactDisputes,
  type DisputedPersonField,
  type PersonFactDisputeDisplay,
} from "@/lib/services/person-fact-dispute";
import { readPersonRecord, type PersonRecord } from "@/lib/services/person-record";
import { readCurrentSeason } from "@/lib/services/seasons";
import { gateShellPage } from "../../gate";
import { labelFor, statusColour, STATUS_LABELS } from "../presentation";
import {
  labelFor as membershipLabelFor,
  MEMBERSHIP_STATUS_LABELS,
  membershipStatusColour,
} from "../../roster/presentation";
import DisputeResolution from "./dispute-resolution";

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

function NotRecorded() {
  return (
    <Typography component="span" color="text.disabled" sx={{ fontStyle: "italic" }}>
      not recorded
    </Typography>
  );
}

function By({ who }: { who: string | null }) {
  if (!who) return null;
  return (
    <Typography
      component="span"
      variant="caption"
      sx={{ border: 1, borderColor: "divider", borderRadius: 0.5, px: 0.5, ml: 1 }}
    >
      {who}
    </Typography>
  );
}

/**
 * "Who supplied it" for a field with no stored `source` of its own —
 * `person-record.ts` derives `who` from `audit_events` (`Q-13`). Unlike
 * `By`, whose silence on a contact or alias means "this substrate carries no
 * source at all", `null` here means "no audit row exists yet" — a different
 * fact, and one `Q-13` chose to say plainly rather than leave blank.
 */
function DerivedBy({ who }: { who: string | null }) {
  if (who) return <By who={who} />;
  return (
    <Typography
      component="span"
      variant="caption"
      color="text.disabled"
      sx={{ fontStyle: "italic", ml: 1 }}
    >
      not recorded
    </Typography>
  );
}

/** `28 Aug` — the short form the disputed-fact badges use, distinct from the merge notice's full date. */
function shortDate(value: Date): string {
  return value.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * The disputed-fact half of one `Fact` row — `WP-operator-record` (LAN-217),
 * `W7`, `REQ-no-silent-overwrite`. Extends the record's own value-plus-`By`
 * shape rather than drawing a second kind of row: while a dispute is open,
 * the player's answer renders as a second line with the same attribution
 * badge, and the four-role resolve control sits beneath it; once resolved,
 * the losing value stays visible on a second line, dated, so "the losing
 * value is retained, never deleted" is something the record shows and not
 * only something the database keeps.
 *
 * Nothing here changes what the primary value or its own badge already show:
 * taking the player's answer writes through `updatePersonField`, which is
 * already attributed by the shipped `Q-13` derivation once the field is
 * re-read, and keeping the club's value leaves that badge exactly as it was.
 * The one fact only this dispute row can attribute is the confirmation
 * itself — the resolve, when nothing on `people` changed to carry it.
 */
function DisputedFact({
  personId,
  dispute,
}: {
  personId: string;
  dispute: PersonFactDisputeDisplay | undefined;
}) {
  if (!dispute) return null;
  if (dispute.status === "open") {
    return (
      <Box sx={{ mt: 0.5 }} data-testid="dispute-open">
        <Typography component="span">{dispute.playerValue}</Typography>
        <By who={`${dispute.raisedByName ?? "the player"}, ${shortDate(dispute.raisedAt)}`} />
        <DisputeResolution personId={personId} disputeId={dispute.id} />
      </Box>
    );
  }
  const losingValue =
    dispute.status === "resolved_took_player" ? dispute.clubValue : dispute.playerValue;
  if (losingValue === null || dispute.resolvedAt === null) return null;
  const badge =
    dispute.status === "resolved_took_player"
      ? `Superseded ${shortDate(dispute.resolvedAt)}`
      : `Not accepted · ${dispute.resolvedByName ?? "an operator"}, ${shortDate(dispute.resolvedAt)}`;
  return (
    <Box sx={{ mt: 0.5 }} data-testid="dispute-retained">
      <Typography component="span" color="text.secondary" sx={{ textDecoration: "line-through" }}>
        {losingValue}
      </Typography>
      <By who={badge} />
    </Box>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={{ xs: 0.25, sm: 2 }}
      sx={{
        py: 1.125,
        borderBottom: 1,
        borderColor: "divider",
        "&:last-child": { borderBottom: 0 },
      }}
    >
      <Typography variant="body2" color="text.secondary" sx={{ width: { sm: 190 }, flexShrink: 0 }}>
        {label}
      </Typography>
      <Box sx={{ minWidth: 0, overflowWrap: "anywhere" }}>{children}</Box>
    </Stack>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{ justifyContent: "space-between", alignItems: "baseline", mb: 0.75 }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        {action}
      </Stack>
      {children}
    </Paper>
  );
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

  const [predecessors, roles, seasons, history, currentSeason, latestDisputes] = await Promise.all([
    listMergedPredecessors(personId),
    listPersonRoleAssignments(personId),
    listPersonSeasons(personId),
    readPersonHistory(personId),
    readCurrentSeason().catch(() => null),
    readLatestPersonFactDisputes(personId),
  ]);
  const disputesByField = new Map<DisputedPersonField, PersonFactDisputeDisplay>(
    latestDisputes.map((dispute) => [dispute.field, dispute]),
  );

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
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ justifyContent: "space-between", alignItems: { sm: "flex-start" } }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" color="text.secondary">
            <Button href="/operate/people" sx={{ p: 0, minHeight: 0, textTransform: "none" }}>
              ← People
            </Button>
          </Typography>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mt: 0.5 }}>
            {record.displayName}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1, mt: 1 }}>
            {record.status !== null ? (
              <Chip
                size="small"
                label={labelFor(STATUS_LABELS, record.status)}
                color={statusColour(record.status)}
              />
            ) : null}
            {clubRoleSummary ? (
              <Chip size="small" variant="outlined" label={clubRoleSummary} />
            ) : null}
          </Stack>
        </Box>
        <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
          {/* LAN-185 builds correction and merge; this routes to them and builds neither. */}
          <Button
            variant="outlined"
            href={`/operate/people/${personId}/edit`}
            sx={{ minHeight: 44 }}
          >
            Correct this record
          </Button>
          <Button
            href={`/operate/people/${personId}/merge`}
            sx={{ minHeight: 44, textTransform: "none" }}
          >
            Merge…
          </Button>
        </Stack>
      </Stack>

      {predecessors.map((predecessor) => (
        <Alert key={predecessor.personId} severity="info" data-testid="merge-notice">
          &ldquo;{predecessor.displayName}&rdquo; was merged into this record on{" "}
          {predecessor.mergedAt.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          {predecessor.mergedByDisplayName ? ` by ${predecessor.mergedByDisplayName}` : ""}.
        </Alert>
      ))}

      {record.missingRequiredFields.length > 0 ? (
        <Alert severity="warning" data-testid="record-missing-banner">
          {record.missingRequiredFields.length} required{" "}
          {record.missingRequiredFields.length === 1 ? "fact is" : "facts are"} missing.
        </Alert>
      ) : null}

      <Section title="Who they are">
        <Fact label="First name">
          {visible.givenName ? (
            <>
              {record.givenName}
              <DerivedBy who={record.givenNameSource} />
              <DisputedFact personId={personId} dispute={disputesByField.get("given_name")} />
            </>
          ) : (
            <NotRecorded />
          )}
        </Fact>
        <Fact label="Last name">
          {record.familyName !== null ? (
            <>
              {record.familyName}
              <DerivedBy who={record.familyNameSource} />
              <DisputedFact personId={personId} dispute={disputesByField.get("family_name")} />
            </>
          ) : (
            <NotRecorded />
          )}
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
                    <Chip size="small" variant="outlined" label="display name" sx={{ ml: 1 }} />
                  ) : null}
                  <By who={alias.source} />
                </Box>
              ))}
            </Stack>
          )}
        </Fact>
      </Section>

      {visible.contacts !== undefined ? (
        <Section title="How to reach them">
          <Fact label="Mobile phone">
            {mobile ? (
              <>
                {mobile.rawValue}
                <By who={mobile.source} />
              </>
            ) : (
              <NotRecorded />
            )}
          </Fact>
          <Fact label={`On WhatsApp${currentSeason ? ` · ${currentSeason.label}` : ""}`}>
            <NotRecorded />
          </Fact>
          <Fact label="Personal email">
            {personalEmail ? (
              <>
                {personalEmail.rawValue}
                <By who={personalEmail.source} />
              </>
            ) : (
              <NotRecorded />
            )}
          </Fact>
          <Fact label="College email">
            {collegeEmail ? (
              <>
                {collegeEmail.rawValue}
                <By who={collegeEmail.source} />
              </>
            ) : (
              <NotRecorded />
            )}
          </Fact>
        </Section>
      ) : null}

      {visible.college !== undefined ? (
        <Section title="Academic">
          <Fact label="College">
            {record.college !== null ? (
              <>
                {record.college}
                <DerivedBy who={record.collegeSource} />
                <DisputedFact personId={personId} dispute={disputesByField.get("college")} />
              </>
            ) : (
              <NotRecorded />
            )}
          </Fact>
          <Fact label="Matriculation year">
            {record.matriculationYear !== null ? (
              <>
                {record.matriculationYear}
                <DerivedBy who={record.matriculationYearSource} />
                <DisputedFact
                  personId={personId}
                  dispute={disputesByField.get("matriculation_year")}
                />
              </>
            ) : (
              <NotRecorded />
            )}
          </Fact>
          <Fact label="Expected graduation">
            {record.expectedGraduationYear !== null ? (
              <>
                {record.expectedGraduationYear}
                <DerivedBy who={record.expectedGraduationYearSource} />
                <DisputedFact
                  personId={personId}
                  dispute={disputesByField.get("expected_graduation_year")}
                />
              </>
            ) : (
              <NotRecorded />
            )}
          </Fact>
          <Fact label="Degree field">
            {record.degreeField !== null ? (
              <>
                {record.degreeField}
                <DerivedBy who={record.degreeFieldSource} />
                <DisputedFact personId={personId} dispute={disputesByField.get("degree_field")} />
              </>
            ) : (
              <NotRecorded />
            )}
          </Fact>
        </Section>
      ) : null}

      {visible.dateOfBirth !== undefined ? (
        <Section title="Restricted">
          <Fact label="Date of birth">
            {record.dateOfBirth !== null ? (
              <>
                {record.dateOfBirth}
                <DerivedBy who={record.dateOfBirthSource} />
                <DisputedFact personId={personId} dispute={disputesByField.get("date_of_birth")} />
              </>
            ) : (
              <NotRecorded />
            )}
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
        <Section title="Where they stand">
          <Fact label="Status">
            {record.status !== null ? (
              <Chip
                size="small"
                label={labelFor(STATUS_LABELS, record.status)}
                color={statusColour(record.status)}
              />
            ) : (
              <Typography color="text.secondary">—</Typography>
            )}
          </Fact>
          <Fact label="Alumni standing">
            {alumniLabel}
            {record.standingIsOverridden ? (
              <Chip size="small" variant="outlined" label="Override" sx={{ ml: 1 }} />
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
                      <Chip size="small" variant="outlined" label="ended" sx={{ ml: 1 }} />
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

      <Section title="Their seasons">
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
                <Chip
                  size="small"
                  label={membershipLabelFor(MEMBERSHIP_STATUS_LABELS, season.status)}
                  color={membershipStatusColour(season.status)}
                />
              </Stack>
            ))}
          </Stack>
        )}
      </Section>

      <Section
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
                <TextField
                  select
                  name="field"
                  label="Field"
                  size="small"
                  defaultValue={historyField}
                  sx={{ minWidth: 180 }}
                  slotProps={{ select: { native: false } }}
                >
                  <MenuItem value="">All</MenuItem>
                  {fields.map((field) => (
                    <MenuItem key={field} value={field}>
                      {field}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  name="actor"
                  label="Changed by"
                  size="small"
                  defaultValue={historyActor}
                  sx={{ minWidth: 200 }}
                >
                  <MenuItem value="">All</MenuItem>
                  {actors.map((actor) => (
                    <MenuItem key={actor} value={actor}>
                      {actor}
                    </MenuItem>
                  ))}
                </TextField>
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
              <Typography color="text.secondary">No changes match these filters.</Typography>
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
          → <Typography component="span">{entry.toValue}</Typography>
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
