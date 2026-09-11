"use client";

import { useState, useTransition } from "react";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Metric, MetricRow } from "@/components/metric";
import { StatusChip } from "@/components/status-chip";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import type { MembershipStatus, OnboardingItemStatus } from "@/lib/services/membership";
import {
  SUBS_INVOICED_ITEM_CODE,
  SUBS_PAID_ITEM_CODE,
} from "@/lib/services/onboarding-item-shapes";
import type { PersonRecord } from "@/lib/services/person-record";
// The queue's own wording for the chase, imported rather than reproduced —
// LAN-266 requirement 2 asks for "the same words the queue already uses".
import { formatChaseNext } from "@/app/operate/people/missing/chase-presentation";
import type { OnboardingItemDisplay, PlayerRecordData } from "@/lib/services/player-record";
import type { FormalwearItemKey, Kit, PositionColumn } from "@/lib/services/roster-board";

import { RecordField } from "@/components/record-field";
import { Section } from "@/components/section";
import AttendanceSection from "./attendance-section";
import SendOnboardingQuestionnaireButton, {
  sendStatusLines,
} from "./send-onboarding-questionnaire-button";
import { ENTRY_LABELS, formatDay, labelFor, MEMBERSHIP_STATUS_LABELS } from "../presentation";
import {
  recordCommitAvailabilityAction,
  recordCommitBluesAction,
  recordCommitCoachGroupAction,
  recordCommitEligibilityAction,
  recordCommitEntryAction,
  recordCommitFormalwearItemAction,
  recordCommitJerseyNumbersAction,
  recordCommitPositionAction,
  recordResolveOnboardingItemAction,
  recordSetStatusAction,
} from "./record-actions";
import OnboardingRow from "./onboarding-row";
import OtherSeasons from "./other-seasons";
import StatusHistory from "./status-history";
import ActivityLog from "./activity-log";
import SeasonFactsSection from "./season-facts-section";
import { currentContact, formatEmergencyContact, joinAliases } from "./record-view-presentation";

/**
 * `/operate/roster/[membershipId]` — W6, rebuilt. LAN-187. Every season fact
 * edits in place, exactly as the board's own cells do; a departed or
 * archived membership renders complete and read-only, with each field's
 * editor absent rather than disabled.
 *
 * Decision history: docs/ux/tickets/LAN-187-player-record.md.
 */
/** A departed or archived membership takes no writes (`closed`, below); the send is a write like any other — LAN-266. */
const CLOSED_MEMBERSHIP_REASON =
  "This membership is closed, so nothing further is sent to this player.";

/** LAN-257 — the operator's own words for the two things intake collects. */
const TYPED_CONTACT_LABELS: Readonly<Record<"email" | "phone", string>> = Object.freeze({
  email: "Email",
  phone: "Phone",
});

export default function PlayerRecordView({
  record,
  person,
  justCreated,
  linkedExisting = false,
  unsavedContacts = [],
}: {
  record: PlayerRecordData;
  /** Redacted for the viewer's role — `REQ-authority`. May be missing keys a category did not grant. */
  person: Partial<PersonRecord>;
  justCreated: boolean;
  /** LAN-257 — the intake used a person already on record rather than minting one. */
  linkedExisting?: boolean;
  /** LAN-257 — kinds the operator typed that were deliberately not written to that person. */
  unsavedContacts?: ("email" | "phone")[];
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [fieldError, setFieldError] = useState<{ key: string; message: string } | null>(null);

  const closed = record.status === "departed" || record.status === "archived";
  const resolvedCount = record.onboardingItems.filter((item) =>
    ["complete", "waived", "not_applicable"].includes(item.status),
  ).length;
  const bluesTotal =
    person.fullBlueCount || person.halfBlueCount
      ? [
          person.fullBlueCount ? `${person.fullBlueCount} Full` : null,
          person.halfBlueCount ? `${person.halfBlueCount} Half` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : "None";

  const personalEmail = currentContact(person.contacts, "email", "personal");
  const mobile = currentContact(person.contacts, "phone", null);

  async function runCommit(key: string, action: () => Promise<{ error: string | null }>) {
    setFieldError(null);
    const result = await action();
    if (result.error) setFieldError({ key, message: result.error });
    setEditing(null);
  }

  function commitSeasonField(key: string, next: string | string[]) {
    startTransition(() => {
      void (async () => {
        switch (key) {
          case "status":
            await runCommit(key, () =>
              recordSetStatusAction({
                membershipId: record.membershipId,
                status: next as MembershipStatus,
              }),
            );
            return;
          case "entry":
            await runCommit(key, () =>
              recordCommitEntryAction({
                membershipId: record.membershipId,
                entry: next as "new" | "returning",
              }),
            );
            return;
          case "offencePosition":
          case "defencePosition":
          case "specialTeamsPosition": {
            const column: PositionColumn =
              key === "offencePosition"
                ? "offence"
                : key === "defencePosition"
                  ? "defence"
                  : "specialTeams";
            await runCommit(key, () =>
              recordCommitPositionAction({
                membershipId: record.membershipId,
                seasonId: record.seasonId,
                column,
                code: (next as string) || null,
              }),
            );
            return;
          }
          case "coachGroup":
            await runCommit(key, () =>
              recordCommitCoachGroupAction({
                membershipId: record.membershipId,
                seasonId: record.seasonId,
                coachGroup: (next as string) || null,
              }),
            );
            return;
          case "blues":
            await runCommit(key, () =>
              recordCommitBluesAction({
                membershipId: record.membershipId,
                seasonId: record.seasonId,
                value: next as "Full" | "Half" | "None",
              }),
            );
            return;
          case "eligibility":
            await runCommit(key, () =>
              recordCommitEligibilityAction({
                membershipId: record.membershipId,
                seasonId: record.seasonId,
                status: next as "pending" | "eligible" | "ineligible" | "expired",
              }),
            );
            return;
          case "availability":
            await runCommit(key, () =>
              recordCommitAvailabilityAction({
                membershipId: record.membershipId,
                level: next as "green" | "orange" | "red",
              }),
            );
            return;
          case "blueNumbers":
          case "whiteNumbers": {
            const kit: Kit = key === "blueNumbers" ? "blue" : "white";
            await runCommit(key, () =>
              recordCommitJerseyNumbersAction({
                membershipId: record.membershipId,
                seasonId: record.seasonId,
                kit,
                numbers: next as string[],
              }),
            );
            return;
          }
          default:
            return;
        }
      })();
    });
  }

  function toggleFormalwear(item: FormalwearItemKey, owned: boolean) {
    startTransition(() => {
      void runCommit("formalwear", () =>
        recordCommitFormalwearItemAction({
          membershipId: record.membershipId,
          seasonId: record.seasonId,
          item,
          owned,
        }),
      );
    });
  }

  function resolveOnboardingItem(item: OnboardingItemDisplay, status: OnboardingItemStatus) {
    startTransition(() => {
      void runCommit(`item:${item.id}`, () =>
        recordResolveOnboardingItemAction({
          membershipId: record.membershipId,
          itemId: item.id,
          status,
        }),
      );
    });
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 900 }}>
      <PageHeader
        title={justCreated ? "Returning player added" : (person.displayName ?? record.membershipId)}
        back={{ href: "/operate/roster", label: "Back to roster" }}
        subtitle={
          justCreated ? (
            <span data-testid="created-summary">
              {linkedExisting
                ? // LAN-257: nobody was created — the confirmation answers "is this them?", a different question.
                  `${record.seasonLabel} membership was added to a person already on record.`
                : `Person and ${record.seasonLabel} membership were created together.`}
            </span>
          ) : (
            <span data-testid="membership-subtitle">{`${record.seasonLabel} membership · ${labelFor(ENTRY_LABELS, record.entry)} · ${labelFor(MEMBERSHIP_STATUS_LABELS, record.status)}`}</span>
          )
        }
      />
      {/* LAN-257: the intake wrote nothing onto a linked person — said here, by field, with the one surface that can change them. */}
      {justCreated && unsavedContacts.length > 0 ? (
        <Notice severity="info" testId="intake-contact-not-recorded">
          Not recorded on {person.displayName ?? "this person"}&rsquo;s record:{" "}
          {unsavedContacts.map((kind) => TYPED_CONTACT_LABELS[kind]).join(" · ")}.{" "}
          <Button
            href={`/operate/people/${record.personId}/edit`}
            sx={{ p: 0, minHeight: 0, textTransform: "none", color: "inherit", fontWeight: 700 }}
            data-testid="intake-contact-correct-link"
          >
            Correct this record →
          </Button>
        </Notice>
      ) : null}
      <MetricRow columns={3}>
        <Metric
          value={
            <StatusChip
              domain="membership"
              status={record.status}
              label={labelFor(MEMBERSHIP_STATUS_LABELS, record.status)}
            />
          }
          label="Membership"
        />
        <Metric
          value={
            record.onboardingItems.length === 0
              ? "No items configured"
              : `${resolvedCount} of ${record.onboardingItems.length}`
          }
          label="Onboarding items resolved"
        />
        <Metric value={labelFor(ENTRY_LABELS, record.entry)} label="Entry" />
        <Metric value={bluesTotal} label="Blues total · all seasons" />
        <Metric
          value={record.isConstitutionalMember ? "Yes" : "No"}
          label="Constitutional member · derived"
        />
        {person.missingRequiredFields && person.missingRequiredFields.length > 0 ? (
          <Metric
            value={
              <Typography
                variant="body2"
                color="warning.main"
                data-testid="missing-flag"
              >{`${person.missingRequiredFields.length} missing`}</Typography>
            }
            label="Missing required data"
          />
        ) : null}
      </MetricRow>

      <Section
        variant="banded"
        band="person"
        title="Person"
        testId="person"
        action={
          <Button
            href={`/operate/people/${record.personId}`}
            sx={{ p: 0, minHeight: 0, textTransform: "none", color: "inherit", fontWeight: 700 }}
            data-testid="open-person-record"
          >
            Open the person record →
          </Button>
        }
      >
        <RecordField label="Name" value={person.displayName ?? null} />
        <RecordField label="Aliases" value={joinAliases(person.aliases)} />
        <RecordField label="Mobile phone" value={mobile} />
        <RecordField label="Personal email" value={personalEmail} />
        <RecordField label="College" value={person.college ?? null} />
        <RecordField
          label="Matriculation year"
          value={person.matriculationYear != null ? String(person.matriculationYear) : null}
        />
        <RecordField
          label="Expected graduation"
          value={
            person.expectedGraduationYear != null ? String(person.expectedGraduationYear) : null
          }
        />
        <RecordField label="Degree field" value={person.degreeField ?? null} />
        <RecordField
          label="Date of birth"
          value={person.dateOfBirth ? formatDay(person.dateOfBirth) : null}
        />
        <RecordField
          label="Emergency contact"
          value={formatEmergencyContact(person.emergencyContact)}
        />
        <RecordField
          label="Under 18"
          value={
            person.isUnder18 === null || person.isUnder18 === undefined
              ? null
              : person.isUnder18
                ? "Yes"
                : "No"
          }
          note="Derived from date of birth"
        />
      </Section>

      <Section variant="banded" band="onboarding" title="Onboarding" testId="onboarding">
        {record.onboardingItems.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 2 }} data-testid="onboarding-empty">
            This season has no onboarding items configured, so this membership has none.
          </Typography>
        ) : (
          record.onboardingItems.map((item) => (
            <OnboardingRow
              key={item.id}
              item={item}
              editing={editing === `item:${item.id}`}
              readOnly={closed}
              blank={
                item.code === SUBS_PAID_ITEM_CODE &&
                record.onboardingItems.find((each) => each.code === SUBS_INVOICED_ITEM_CODE)
                  ?.status !== "complete"
              }
              error={fieldError?.key === `item:${item.id}` ? fieldError.message : null}
              onOpen={() => setEditing(`item:${item.id}`)}
              onClose={() => setEditing(null)}
              onResolve={(status) => resolveOnboardingItem(item, status)}
            />
          ))
        )}
        {record.outstandingRequired.length > 0 ? (
          <Notice severity="info" testId="outstanding-note">
            {/* W3, Q-19: names the outstanding item(s) as a value — same count sentence, no second explanatory sentence. */}
            {`${record.outstandingRequired.length === 1 ? "One required item is" : `${record.outstandingRequired.length} required items are`} still outstanding: ${record.outstandingRequired.map((item) => item.label).join(", ")}.`}
          </Notice>
        ) : null}

        {/* LAN-266: same control as the recruit record, same position/style. Decision history: missions/intake/M-ONBOARDING-AND-INFORMATION-COMPLETION */}
        <Box sx={{ py: 1.5 }} data-testid="onboarding-send">
          <SendOnboardingQuestionnaireButton
            membershipId={record.membershipId}
            displayName={person.displayName ?? "This player"}
            everSent={record.send.lastAsk !== null}
            canSend={record.send.withheldReason === null && !closed}
            withheldReason={closed ? CLOSED_MEMBERSHIP_REASON : record.send.withheldReason}
            blocked={!record.send.onboarding || closed}
          />
          {sendStatusLines({
            lastAsk: record.send.lastAsk
              ? {
                  requestedAt: record.send.lastAsk.requestedAt.toISOString(),
                  delivery: record.send.lastAsk.delivery,
                  reason: record.send.lastAsk.reason,
                }
              : null,
            chaseLine: formatChaseNext(record.send.next, record.send.hasReachableNumber),
            chaseIsScheduled: record.send.next.kind === "scheduled",
            deliveredCount: record.send.deliveredCount,
            chaseCount: record.send.chaseCount,
          }).map((line, index) => (
            <Typography
              key={line}
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mt: index === 0 ? 1 : 0.25 }}
              data-testid={`onboarding-send-caption-${index}`}
            >
              {line}
            </Typography>
          ))}
        </Box>
      </Section>

      <Section variant="banded" band="onboarding" title="Activity" testId="activity">
        <ActivityLog sections={record.activityLog} />
      </Section>

      <SeasonFactsSection
        record={record}
        editing={editing}
        closed={closed}
        fieldErrorKey={fieldError?.key ?? null}
        fieldErrorMessage={fieldError?.message ?? null}
        setEditing={setEditing}
        commitSeasonField={commitSeasonField}
        toggleFormalwear={toggleFormalwear}
      />

      <Section variant="banded" band="attendance" title="Attendance" testId="attendance">
        <AttendanceSection events={record.attendance} />
      </Section>

      <Section variant="banded" band="history" title="Their other seasons" testId="other-seasons">
        <OtherSeasons seasons={record.otherSeasons} />
      </Section>

      <Section
        collapsible
        title="Status history"
        testId="status-history"
        action={
          <Button
            href={`/operate/people/${record.personId}?history=expanded`}
            sx={{ p: 0, minHeight: 0, textTransform: "none", color: "inherit", fontWeight: 700 }}
            data-testid="open-person-history"
          >
            Everything that changed about this person →
          </Button>
        }
      >
        <StatusHistory history={record.statusHistory} />
      </Section>

      {pending ? null : null}
    </Stack>
  );
}
