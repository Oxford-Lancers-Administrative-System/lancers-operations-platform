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
import { readRecruitConsentForPerson } from "@/lib/services/recruitment-prospect";
import { readCurrentSeason } from "@/lib/services/seasons";
import { readErasureState, type ErasureState } from "@/lib/services/person-erasure";
import { roleCodesPermit } from "@/lib/auth/capabilities";
import { gateShellPage } from "../../gate";
import { labelFor, STATUS_LABELS } from "../presentation";
import { IdentitySection, ContactSection } from "./identity-contact-sections";
import { MessagingSection } from "./messaging-section";
import { RestrictedSection } from "./academic-restricted-sections";
import StatusSection from "./status-section";
import SeasonsSection from "./seasons-section";
import HistorySection from "./history-section";
import { ErasurePanel } from "./erasure-panel";
import { Section } from "@/components/section";
import {
  mayEditRecruiting,
  mayEditRoster,
  mayViewRoster,
  ROSTER_REACH,
  WHOLE_RECORD_AUTHORITY,
} from "@/lib/auth/roster-access";
import { operatorHoldsAccess } from "@/lib/auth/guards";

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
  // LAN-432: the person record follows the roster's grants (Brian,
  // 2026-09-25). Who they are, Restricted, Where they stand, Messaging and the
  // history read as Person; How to reach them as Contact & emergency; Their
  // seasons as Membership. A `none` section is a locked head, and nothing of
  // it leaves this server.
  const gate = await gateShellPage(`/operate/people/${personId}`, ROSTER_REACH);
  if ("screen" in gate) return gate.screen;
  const grants = gate.operator.grants;
  const personOpen = mayViewRoster(grants, "person");
  const contactOpen = mayViewRoster(grants, "contact_emergency");
  const membershipOpen = mayViewRoster(grants, "membership");
  const mayCorrect = mayEditRoster(grants, "person") || mayEditRoster(grants, "contact_emergency");
  const mayMerge = operatorHoldsAccess(gate.operator, WHOLE_RECORD_AUTHORITY);

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

  // LAN-361: read only for an operator who holds the capability. The service
  // guards it too; this keeps the read off the page for everybody else.
  const erasure: ErasureState | null = roleCodesPermit(gate.operator.roleCodes, "person_erasure")
    ? await readErasureState(personId)
    : null;

  const visible = redactPersonRecord(
    record as unknown as Record<string, unknown>,
    gate.operator.grants,
  ) as unknown as Partial<PersonRecord>;

  const [predecessors, roles, seasons, fullHistory, currentSeason, recruitConsent] =
    await Promise.all([
      listMergedPredecessors(personId),
      personOpen ? listPersonRoleAssignments(personId) : Promise.resolve([]),
      membershipOpen ? listPersonSeasons(personId) : Promise.resolve([]),
      personOpen ? readPersonHistory(personId) : Promise.resolve([]),
      readCurrentSeason().catch(() => null),
      // LAN-371. `null` for anybody who is not a recruit this season, which is
      // what keeps the control off a roster player's record (LAN-372).
      personOpen ? readRecruitConsentForPerson(personId).catch(() => null) : Promise.resolve(null),
    ]);
  // A change to a contact point or the emergency contact is Contact & emergency's.
  const history = contactOpen ? fullHistory : fullHistory.filter((entry) => !entry.contactFact);

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
        subtitle={personOpen ? clubRoleSummary : null}
        back={{ href: "/operate/people", label: "Back to people" }}
        status={
          personOpen && record.status !== null ? (
            <StatusChip
              domain={record.status === "recruit" ? "personType" : "membership"}
              status={record.status}
              label={labelFor(STATUS_LABELS, record.status)}
            />
          ) : undefined
        }
        actions={
          mayCorrect || mayMerge ? (
            <>
              {mayCorrect ? (
                <Button variant="outlined" href={`/operate/people/${personId}/edit`}>
                  Correct this record
                </Button>
              ) : null}
              {mayMerge ? <Button href={`/operate/people/${personId}/merge`}>Merge…</Button> : null}
            </>
          ) : undefined
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

      {personOpen && record.missingRequiredFields.length > 0 ? (
        <Notice severity="warning" testId="record-missing-banner">
          {record.missingRequiredFields.length} required{" "}
          {record.missingRequiredFields.length === 1 ? "fact is" : "facts are"} missing.
        </Notice>
      ) : null}

      {/* LAN-307: every section takes the redacted record, and the recruit
          record renders these same components from the same shape.
          LAN-365 correction: "Who they are" (IdentitySection, which now also
          carries the four academic facts and the two identifiers) is
          rendered after "How to reach them", per Brian's ordering. */}
      {contactOpen ? (
        <ContactSection record={visible} currentSeasonLabel={currentSeason?.label ?? null} />
      ) : (
        <Section variant="banded" band="person" title="How to reach them" locked />
      )}

      {personOpen ? (
        <IdentitySection record={visible} />
      ) : (
        <Section variant="banded" band="person" title="Who they are" locked />
      )}

      {recruitConsent ? (
        <MessagingSection
          consent={recruitConsent}
          displayName={record.displayName}
          mayChange={mayEditRecruiting(grants, "recruit_details")}
        />
      ) : null}

      {personOpen ? (
        <RestrictedSection record={visible} />
      ) : (
        <Section variant="banded" band="person" title="Restricted" locked />
      )}

      {personOpen ? (
        <StatusSection
          record={visible}
          roles={roles}
          alumniLabel={alumniLabel}
          mayAssignRole={roleCodesPermit(gate.operator.roleCodes, "role_management")}
        />
      ) : (
        <Section variant="banded" band="person" title="Where they stand" locked />
      )}

      {membershipOpen ? (
        <SeasonsSection seasons={seasons} />
      ) : (
        <Section variant="banded" band="season" title="Their seasons" locked />
      )}

      {personOpen ? (
        <HistorySection
          personId={personId}
          history={history}
          historyExpanded={historyExpanded}
          historyField={historyField}
          historyActor={historyActor}
        />
      ) : null}

      {/* LAN-361: at the bottom of the record, and only for the core four.
          An operator who does not hold the capability sees nothing at all —
          absent from the payload, not disabled on screen. */}
      {erasure ? (
        <ErasurePanel personId={personId} displayName={record.displayName} state={erasure} />
      ) : null}
    </Stack>
  );
}
