import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { Notice } from "@/components/notice";
import { notFound, redirect } from "next/navigation";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { isServiceError } from "@/lib/db";
import { redactPersonRecord } from "@/lib/auth/person-authority";
import {
  listMergedPredecessors,
  listPersonRoleAssignments,
  listPersonSeasons,
  readPersonHistory,
  resolveMergeSurvivor,
} from "@/lib/services/people-directory";
import { readPersonRecord, type PersonRecord } from "@/lib/services/person-record";
import { readCurrentSeason } from "@/lib/services/seasons";
import { gateShellPage } from "../../gate";
import { labelFor, STATUS_LABELS } from "../presentation";
import { IdentitySection, ContactSection } from "./identity-contact-sections";
import { AcademicSection, RestrictedSection } from "./academic-restricted-sections";
import StatusSection from "./status-section";
import SeasonsSection from "./seasons-section";
import HistorySection from "./history-section";

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/** LAN-257 — the operator's own words for the two contacts `Add a person` collects. */
const TYPED_CONTACT_LABELS: Readonly<Record<"email" | "phone", string>> = Object.freeze({
  email: "Personal email",
  phone: "Mobile",
});

/**
 * `W1-05` … `W1-12` — the person record, its restricted section, its
 * merged-away redirect and its history section. LAN-184, `REQ-person-record`,
 * `REQ-history-on-record`, `REQ-restricted-fields`.
 */
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
  // LAN-257: "This is them" wrote nothing onto this person, and now says so
  // here rather than landing silently on a record showing a different number
  // from the one the operator just typed. Kinds only — the value is personal
  // data and a query string is bookmarked, kept in history and logged.
  const justLinked = first(sp.linked) === "1";
  const unsavedContacts = justLinked
    ? first(sp.unsaved)
        .split(",")
        .filter((kind): kind is "email" | "phone" => kind === "email" || kind === "phone")
    : [];
  const historyExpanded = first(sp.history) === "expanded";
  const historyField = first(sp.field);
  const historyActor = first(sp.actor);

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

      {unsavedContacts.length > 0 ? (
        <Notice severity="info" testId="linked-contact-not-recorded">
          Linked to this record. Not recorded:{" "}
          {unsavedContacts.map((kind) => TYPED_CONTACT_LABELS[kind]).join(" · ")}.{" "}
          <Button
            href={`/operate/people/${personId}/edit`}
            sx={{ p: 0, minHeight: 0, textTransform: "none", color: "inherit", fontWeight: 700 }}
            data-testid="linked-contact-correct-link"
          >
            Correct this record →
          </Button>
        </Notice>
      ) : null}

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

      {/* LAN-307: every section takes the redacted record, and the recruit
          record renders these same components from the same shape. */}
      <IdentitySection record={visible} />

      {visible.contacts !== undefined ? (
        <ContactSection record={visible} currentSeasonLabel={currentSeason?.label ?? null} />
      ) : null}

      {visible.college !== undefined ? <AcademicSection record={visible} /> : null}

      {visible.dateOfBirth !== undefined ? <RestrictedSection record={visible} /> : null}

      {visible.status !== undefined ? (
        <StatusSection record={visible} roles={roles} alumniLabel={alumniLabel} />
      ) : null}

      <SeasonsSection seasons={seasons} />

      <HistorySection
        personId={personId}
        history={history}
        historyExpanded={historyExpanded}
        historyField={historyField}
        historyActor={historyActor}
      />
    </Stack>
  );
}
