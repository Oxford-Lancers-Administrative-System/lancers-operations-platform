"use client";

import { useState, useTransition, type ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import type {
  MembershipStatus,
  MembershipStatusEvent,
  OnboardingItemStatus,
} from "@/lib/services/membership";
import {
  allowedItemStates,
  isDerivedItem,
  itemStateLabel,
  SUBS_INVOICED_ITEM_CODE,
  SUBS_PAID_ITEM_CODE,
} from "@/lib/services/onboarding-item-shapes";
import type { PersonRecord } from "@/lib/services/person-record";
import type {
  OnboardingActivitySection,
  OnboardingItemDisplay,
  OnboardingItemHistoryEntry,
  OtherSeasonSummary,
  PlayerRecordData,
  PlayerSeasonFacts,
} from "@/lib/services/player-record";
import type {
  FormalwearItemKey,
  Kit,
  PositionColumn,
  PositionOptions,
} from "@/lib/services/roster-board";

import {
  AVAILABILITY_LABELS,
  AVAILABILITY_VALUES,
  bandOf,
  BLUES_VALUES,
  COACH_GROUPS,
  ELIGIBILITY_LABELS,
  ELIGIBILITY_VALUES,
  ENTRIES,
  FORMALWEAR_ITEMS,
  FORMALWEAR_LABELS,
  STATUS_OPTION_LABELS,
  STATUSES,
  type BandDef,
} from "../board-columns";
import JerseyPicker from "../jersey-picker";
import { BAND_COLOURS as KIT_BANDS } from "@/components/section";
import { NOT_RECORDED, NotRecorded, RecordField, Row, Section } from "../../record-shell";
import AttendanceSection from "./attendance-section";
import {
  ENTRY_LABELS,
  formatDay,
  formatWhen,
  labelFor,
  MEMBERSHIP_STATUS_LABELS,
  membershipStatusColour,
} from "../presentation";
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

/**
 * This row's own state list is `allowedItemStates(item.code)`, and its own
 * words are `itemStateLabel(item.code, status)` — D-002 (correction round 6,
 * `WP-operator-record`, LAN-217): one list, both what the closed cell shows
 * and what the open control offers, so the two cannot say something
 * different again. There is no separate resolution vocabulary and no
 * `reopen` — an operator corrects a mistake by choosing a different one of
 * the item's own states directly, the service refusing anything outside that
 * item's own list. A derived item (`isDerivedItem`) offers no control at all.
 */

/**
 * `/operate/roster/[membershipId]` — W6, rebuilt. LAN-187.
 *
 * The client half of the redesigned record: every season fact edits in
 * place, exactly as the board's own cells do — one click, a dropdown only
 * where the value set is fixed, commits on its own, audited, no reason
 * asked. Person facts render and route to the person record. Onboarding
 * items are the same edit as every other value, which retires the shipped
 * page's per-item `Resolve … ▾` / `SAVE` pair.
 *
 * A departed or archived membership renders complete and read-only, with the
 * Status field's editor **absent** rather than disabled — nothing about a
 * past season is editable from here, and there is nothing to explain about
 * why, because there is no control inviting the question.
 */
export default function PlayerRecordView({
  record,
  person,
  justCreated,
}: {
  record: PlayerRecordData;
  /** Redacted for the viewer's role — `REQ-authority`. May be missing keys a category did not grant. */
  person: Partial<PersonRecord>;
  justCreated: boolean;
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
      <Box>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {justCreated ? "Returning player added" : (person.displayName ?? record.membershipId)}
        </Typography>
        {justCreated ? (
          <Typography color="text.secondary" sx={{ mt: 1 }} data-testid="created-summary">
            Person and {record.seasonLabel} membership were created together.
          </Typography>
        ) : (
          <Typography color="text.secondary" sx={{ mt: 1 }} data-testid="membership-subtitle">
            {`${record.seasonLabel} membership · ${labelFor(ENTRY_LABELS, record.entry)} · ${labelFor(
              MEMBERSHIP_STATUS_LABELS,
              record.status,
            )}`}
          </Typography>
        )}
      </Box>

      {justCreated ? (
        <Alert severity="success">
          The confirmation identifies the resulting person and membership. Raw contact values are
          retained as entered.
        </Alert>
      ) : null}

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ flexWrap: "wrap", gap: 2 }}>
        <Headline
          value={labelFor(MEMBERSHIP_STATUS_LABELS, record.status)}
          label="Membership"
          colour={membershipStatusColour(record.status)}
        />
        <Headline
          value={
            record.onboardingItems.length === 0
              ? "No items configured"
              : `${resolvedCount} of ${record.onboardingItems.length}`
          }
          label="Onboarding items resolved"
        />
        <Headline value={labelFor(ENTRY_LABELS, record.entry)} label="Entry" />
        <Headline value={bluesTotal} label="Blues total · all seasons" />
        <Headline
          value={record.isConstitutionalMember ? "Yes" : "No"}
          label="Constitutional member · derived"
        />
        {person.missingRequiredFields && person.missingRequiredFields.length > 0 ? (
          <Headline
            value={
              <Chip
                size="small"
                color="warning"
                variant="outlined"
                label={`${person.missingRequiredFields.length} missing`}
                data-testid="missing-flag"
              />
            }
            label="Missing required data"
          />
        ) : null}
      </Stack>

      {/* ------------------------------------------------------------ Person -- */}
      <Section
        colours={sectionColours("person")}
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

      {/* -------------------------------------------------------- Onboarding -- */}
      <Section colours={sectionColours("onboarding")} title="Onboarding" testId="onboarding">
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
          <Alert severity="info" sx={{ mt: 1 }} data-testid="outstanding-note">
            {/* W3, Q-19: Brian had to check every Required badge against every
                status to find the one still outstanding. Naming it here keeps
                the alert's own approved shape and register — the count
                sentence, unchanged, plus the name(s) as a value, never a
                second explanatory sentence. */}
            {`${record.outstandingRequired.length === 1 ? "One required item is" : `${record.outstandingRequired.length} required items are`} still outstanding: ${record.outstandingRequired.map((item) => item.label).join(", ")}.`}
          </Alert>
        ) : null}
      </Section>

      {/* --------------------------------------------------------- Activity -- */}
      <Section colours={sectionColours("onboarding")} title="Activity" testId="activity">
        <ActivityLog sections={record.activityLog} />
      </Section>

      {/* ------------------------------------------------------------ Season -- */}
      <Section
        colours={sectionColours("season")}
        title={`Season · ${record.seasonLabel}`}
        testId="season"
      >
        <RecordField
          label="Status"
          value={labelFor(MEMBERSHIP_STATUS_LABELS, record.status)}
          chip={membershipStatusColour(record.status)}
          options={[...STATUSES]}
          optionLabels={STATUS_OPTION_LABELS}
          editing={editing === "status"}
          readOnly={closed}
          error={fieldError?.key === "status" ? fieldError.message : null}
          onOpen={() => setEditing("status")}
          onClose={() => setEditing(null)}
          onCommit={(next) => commitSeasonField("status", next)}
          rawValue={record.status}
          note={closed ? "This season is over. Nothing here changes it." : undefined}
        />
        <RecordField
          label="Entry"
          value={labelFor(ENTRY_LABELS, record.entry)}
          options={[...ENTRIES]}
          editing={editing === "entry"}
          readOnly={closed}
          error={fieldError?.key === "entry" ? fieldError.message : null}
          onOpen={() => setEditing("entry")}
          onClose={() => setEditing(null)}
          onCommit={(next) => commitSeasonField("entry", next)}
          rawValue={record.entry}
        />
        <RecordField
          label="Confirmed"
          value={record.confirmedOn ? formatDay(record.confirmedOn) : null}
          readOnly
        />
        <RecordField
          label="Activated"
          value={record.activatedOn ? formatDay(record.activatedOn) : null}
          readOnly
        />
        <RecordField
          label="Departed"
          value={record.departedOn ? formatDay(record.departedOn) : null}
          readOnly
        />
        <RecordField
          label="Expected return"
          value={record.expectedReturnOn ? formatDay(record.expectedReturnOn) : null}
          readOnly
        />

        <PositionField
          label="Offence"
          value={record.season.offencePosition}
          options={record.positionOptions.offence}
          editing={editing === "offencePosition"}
          readOnly={closed}
          error={fieldError?.key === "offencePosition" ? fieldError.message : null}
          onOpen={() => setEditing("offencePosition")}
          onClose={() => setEditing(null)}
          onCommit={(next) => commitSeasonField("offencePosition", next)}
        />
        <PositionField
          label="Defence"
          value={record.season.defencePosition}
          options={record.positionOptions.defence}
          editing={editing === "defencePosition"}
          readOnly={closed}
          error={fieldError?.key === "defencePosition" ? fieldError.message : null}
          onOpen={() => setEditing("defencePosition")}
          onClose={() => setEditing(null)}
          onCommit={(next) => commitSeasonField("defencePosition", next)}
        />
        <PositionField
          label="Special teams"
          value={record.season.specialTeamsPosition}
          options={record.positionOptions.specialTeams}
          editing={editing === "specialTeamsPosition"}
          readOnly={closed}
          error={fieldError?.key === "specialTeamsPosition" ? fieldError.message : null}
          onOpen={() => setEditing("specialTeamsPosition")}
          onClose={() => setEditing(null)}
          onCommit={(next) => commitSeasonField("specialTeamsPosition", next)}
        />

        <JerseyField
          label="Jersey — Blue"
          held={record.season.blueNumbers}
          holders={record.jerseyHolders.blue}
          editing={editing === "blueNumbers"}
          readOnly={closed}
          onOpen={() => setEditing("blueNumbers")}
          onClose={() => setEditing(null)}
          onCommit={(next) => commitSeasonField("blueNumbers", next)}
        />
        <JerseyField
          label="Jersey — White"
          held={record.season.whiteNumbers}
          holders={record.jerseyHolders.white}
          editing={editing === "whiteNumbers"}
          readOnly={closed}
          onOpen={() => setEditing("whiteNumbers")}
          onClose={() => setEditing(null)}
          onCommit={(next) => commitSeasonField("whiteNumbers", next)}
        />

        <RecordField
          label="Coach group"
          value={record.season.coachGroup}
          options={[...COACH_GROUPS]}
          editing={editing === "coachGroup"}
          readOnly={closed}
          error={fieldError?.key === "coachGroup" ? fieldError.message : null}
          onOpen={() => setEditing("coachGroup")}
          onClose={() => setEditing(null)}
          onCommit={(next) => commitSeasonField("coachGroup", next)}
          rawValue={record.season.coachGroup}
        />

        <FormalwearField
          season={record.season}
          editing={editing === "formalwear"}
          readOnly={closed}
          onOpen={() => setEditing("formalwear")}
          onClose={() => setEditing(null)}
          onToggle={toggleFormalwear}
        />

        <RecordField
          label="Half / Full Blue"
          value={record.season.blues}
          options={[...BLUES_VALUES]}
          editing={editing === "blues"}
          readOnly={closed}
          error={fieldError?.key === "blues" ? fieldError.message : null}
          onOpen={() => setEditing("blues")}
          onClose={() => setEditing(null)}
          onCommit={(next) => commitSeasonField("blues", next)}
          rawValue={record.season.blues}
        />
        <RecordField
          label="Eligibility"
          value={
            record.season.eligibility
              ? labelFor(ELIGIBILITY_LABELS, record.season.eligibility)
              : null
          }
          options={[...ELIGIBILITY_VALUES]}
          optionLabels={ELIGIBILITY_LABELS}
          editing={editing === "eligibility"}
          readOnly={closed}
          error={fieldError?.key === "eligibility" ? fieldError.message : null}
          onOpen={() => setEditing("eligibility")}
          onClose={() => setEditing(null)}
          onCommit={(next) => commitSeasonField("eligibility", next)}
          rawValue={record.season.eligibility}
        />
        <RecordField
          label="Availability"
          value={
            record.season.availability
              ? labelFor(AVAILABILITY_LABELS, record.season.availability)
              : null
          }
          options={[...AVAILABILITY_VALUES]}
          optionLabels={AVAILABILITY_LABELS}
          editing={editing === "availability"}
          readOnly={closed}
          error={fieldError?.key === "availability" ? fieldError.message : null}
          onOpen={() => setEditing("availability")}
          onClose={() => setEditing(null)}
          onCommit={(next) => commitSeasonField("availability", next)}
          rawValue={record.season.availability}
        />
      </Section>

      {/* ----------------------------------------------------- Attendance -- */}
      <Section colours={sectionColours("attendance")} title="Attendance" testId="attendance">
        <AttendanceSection events={record.attendance} />
      </Section>

      {/* ---------------------------------------------------- Other seasons -- */}
      <Section
        colours={sectionColours("person")}
        title="Their other seasons"
        testId="other-seasons"
      >
        <OtherSeasons seasons={record.otherSeasons} />
      </Section>

      {/* --------------------------------------------------------- History -- */}
      <Section
        colours={sectionColours("person")}
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

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ alignItems: { sm: "center" } }}
      >
        <Button href="/operate/roster" variant="contained" sx={{ minHeight: 44 }}>
          Back to roster
        </Button>
      </Stack>
      {pending ? null : null}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Presentational pieces
// ---------------------------------------------------------------------------

function Headline({
  value,
  label,
  colour,
}: {
  value: ReactNode;
  label: string;
  colour?: "default" | "info" | "success" | "warning";
}) {
  return (
    <Box>
      {colour ? (
        typeof value === "string" ? (
          <Chip label={value} color={colour} />
        ) : (
          value
        )
      ) : typeof value === "string" ? (
        <Typography variant="h6" component="div" sx={{ fontWeight: 700 }}>
          {value}
        </Typography>
      ) : (
        value
      )}
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
        {label}
      </Typography>
    </Box>
  );
}

/**
 * Attendance's own colour — `Q15-attendance`. Violet, constructed the same
 * way as the board's three (a dark hex on a ~5% alpha wash), and defined here
 * rather than added to `board-columns.ts`'s `BANDS`: that file drives the
 * board's own columns, this package does not edit it, and Attendance is not a
 * board column. Deliberately not red, orange or green — the band carries a
 * percentage, and a traffic-light hue would read as a verdict on the number.
 */
const ATTENDANCE_BAND: Pick<BandDef, "header" | "tint"> = Object.freeze({
  // LAN-225 (brief §1.5): the purple goes; attendance reads on the neutral band.
  header: KIT_BANDS.attendance.header,
  tint: KIT_BANDS.attendance.tint,
});

/**
 * Resolves a band's colours for `../../record-shell.tsx`'s `Section` — the
 * board's own three groups (`bandOf`), plus Attendance's own
 * (`ATTENDANCE_BAND`, above), so every surface reads as one product.
 */
function sectionColours(band: "person" | "onboarding" | "season" | "attendance"): {
  header: string;
  tint: string;
} {
  return band === "attendance" ? ATTENDANCE_BAND : bandOf(band);
}

/** A position column, with the code-and-name open list the board's own walkthrough asked for. */
function PositionField({
  label,
  value,
  options,
  editing,
  readOnly,
  error,
  onOpen,
  onClose,
  onCommit,
}: {
  label: string;
  value: string | null;
  options: PositionOptions["offence"];
  editing: boolean;
  readOnly: boolean;
  error: string | null;
  onOpen: () => void;
  onClose: () => void;
  onCommit: (next: string) => void;
}) {
  const editable = !readOnly;
  return (
    <Row label={label}>
      {editing ? (
        <Select
          size="small"
          open
          autoFocus
          value={value ?? ""}
          onClose={onClose}
          onChange={(event) => onCommit(event.target.value)}
          sx={{ minWidth: 220 }}
          MenuProps={{ slotProps: { paper: { sx: { maxHeight: 360 } } } }}
        >
          <MenuItem value="">
            <em>{NOT_RECORDED}</em>
          </MenuItem>
          {options.map((option) => (
            <MenuItem key={option.code} value={option.code}>
              {option.code} — {option.label}
            </MenuItem>
          ))}
        </Select>
      ) : (
        <Box
          onClick={editable ? onOpen : undefined}
          data-testid={editable ? "editable-field" : undefined}
          sx={{
            display: "inline-block",
            cursor: editable ? "pointer" : "default",
            borderRadius: 0.5,
            px: editable ? 0.5 : 0,
            mx: editable ? -0.5 : 0,
            "&:hover": editable ? { bgcolor: "action.hover" } : undefined,
          }}
        >
          {value === null ? (
            <NotRecorded />
          ) : (
            <Typography
              variant="body2"
              sx={{
                textDecoration: "underline",
                textUnderlineOffset: 3,
                textDecorationColor: "rgba(0,0,0,0.25)",
              }}
            >
              {value}
            </Typography>
          )}
        </Box>
      )}
      {error ? (
        <Typography variant="caption" color="error" sx={{ display: "block", mt: 0.25 }}>
          {error}
        </Typography>
      ) : null}
    </Row>
  );
}

/** The board's own jersey picker — the fuller editor W6 keeps, since the board shows only the predominant number. */
function JerseyField({
  label,
  held,
  holders,
  editing,
  readOnly,
  onOpen,
  onClose,
  onCommit,
}: {
  label: string;
  held: readonly string[];
  holders: Record<string, string>;
  editing: boolean;
  readOnly: boolean;
  onOpen: () => void;
  onClose: () => void;
  onCommit: (next: string[]) => void;
}) {
  const editable = !readOnly;
  return (
    <Row label={label}>
      {editing ? (
        <JerseyPicker
          held={held}
          holders={holders}
          onCommit={onCommit}
          onClose={onClose}
          width={264}
        />
      ) : (
        <Box
          onClick={editable ? onOpen : undefined}
          data-testid={editable ? "editable-field" : undefined}
          sx={{
            display: "inline-block",
            cursor: editable ? "pointer" : "default",
            borderRadius: 0.5,
            px: editable ? 0.5 : 0,
            mx: editable ? -0.5 : 0,
            "&:hover": editable ? { bgcolor: "action.hover" } : undefined,
          }}
        >
          {held.length === 0 ? (
            <NotRecorded />
          ) : (
            <Typography
              variant="body2"
              sx={{
                textDecoration: "underline",
                textUnderlineOffset: 3,
                textDecorationColor: "rgba(0,0,0,0.25)",
              }}
            >
              {held.join(", ")}
            </Typography>
          )}
        </Box>
      )}
    </Row>
  );
}

function FormalwearField({
  season,
  editing,
  readOnly,
  onOpen,
  onClose,
  onToggle,
}: {
  season: PlayerSeasonFacts;
  editing: boolean;
  readOnly: boolean;
  onOpen: () => void;
  onClose: () => void;
  onToggle: (item: FormalwearItemKey, owned: boolean) => void;
}) {
  const editable = !readOnly;
  const owned = FORMALWEAR_ITEMS.filter((item) => season.formalwear[item]);
  const display =
    owned.length === 0 ? null : owned.map((item) => FORMALWEAR_LABELS[item]).join(", ");

  return (
    <Row label="Formalwear">
      {editing ? (
        <Select
          size="small"
          open
          multiple
          value={owned}
          onClose={onClose}
          renderValue={(value) =>
            (value as string[]).map((item) => FORMALWEAR_LABELS[item]).join(", ") || "—"
          }
          sx={{ minWidth: 220 }}
        >
          {FORMALWEAR_ITEMS.map((item) => (
            <MenuItem
              key={item}
              value={item}
              onClick={() => onToggle(item, !season.formalwear[item])}
            >
              <Checkbox size="small" sx={{ p: 0, mr: 1 }} checked={season.formalwear[item]} />
              <ListItemText primary={FORMALWEAR_LABELS[item]} />
            </MenuItem>
          ))}
        </Select>
      ) : (
        <Box
          onClick={editable ? onOpen : undefined}
          data-testid={editable ? "editable-field" : undefined}
          sx={{
            display: "inline-block",
            cursor: editable ? "pointer" : "default",
            borderRadius: 0.5,
            px: editable ? 0.5 : 0,
            mx: editable ? -0.5 : 0,
            "&:hover": editable ? { bgcolor: "action.hover" } : undefined,
          }}
        >
          {display === null ? (
            <NotRecorded />
          ) : (
            <Typography
              variant="body2"
              sx={{
                textDecoration: "underline",
                textUnderlineOffset: 3,
                textDecorationColor: "rgba(0,0,0,0.25)",
              }}
            >
              {display}
            </Typography>
          )}
        </Box>
      )}
    </Row>
  );
}

/**
 * One onboarding item — provenance shown, edited the same way as every other
 * season value. `REQ-player-detail`: "no Resolve/SAVE pair anywhere."
 *
 * Every state commits the moment it is chosen, exactly like every other
 * in-place edit — Waived (Subscription paid only) included.
 * `WP-operator-record` (LAN-217) retired the reason field this row used to
 * open on Waived: `REQ-reason-free-waive` supersedes the schema's old
 * `onboarding_items_waiver_is_justified` constraint (unwound by the
 * substrate, LAN-214), the author stays mandatory and is supplied by the
 * verified operator this gate resolves, and `W6-02`'s approved screen shows
 * no reason field to keep.
 *
 * D-002 (correction round 6): there is no separate `Reopen` option any more
 * — an operator corrects a mistake by choosing a different one of the
 * item's own states directly, from any current state. A derived item
 * (`isDerivedItem`) renders with no control at all: nothing to open, and the
 * service itself refuses any attempt to set one directly.
 */
function OnboardingRow({
  item,
  editing,
  readOnly,
  blank = false,
  error,
  onOpen,
  onClose,
  onResolve,
}: {
  item: OnboardingItemDisplay;
  editing: boolean;
  readOnly: boolean;
  /**
   * D-002 (Q-14): "Subscription paid" is blank — nothing at all — until
   * "Subscription invoiced" is itself complete. No control opens; the item's
   * own stored `pending` (there is nothing else it could be, since the
   * service refuses the write that would change it) reads as `NotRecorded`,
   * the same as any other genuinely absent value on this page.
   */
  blank?: boolean;
  error: string | null;
  onOpen: () => void;
  onClose: () => void;
  onResolve: (status: OnboardingItemStatus) => void;
}) {
  const derived = isDerivedItem(item.code);
  const editable = !readOnly && !blank && !derived;
  const states = allowedItemStates(item.code);
  const closedLabel = itemStateLabel(item.code, item.status);

  return (
    <Row label={item.label} note={provenanceNote(item)}>
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: "center", flexWrap: "wrap", gap: 0.5, mb: 0.5 }}
      >
        {item.isRequired ? <Chip size="small" variant="outlined" label="Required" /> : null}
        {item.isSubscription ? (
          <Chip size="small" variant="outlined" label="Never blocks activation" />
        ) : null}
      </Stack>
      {editing ? (
        <Select
          size="small"
          open
          autoFocus
          value=""
          displayEmpty
          onClose={onClose}
          onChange={(event) => onResolve(event.target.value as OnboardingItemStatus)}
          renderValue={() => closedLabel}
          sx={{ minWidth: 220 }}
        >
          {states.map((status) => (
            <MenuItem key={status} value={status}>
              {itemStateLabel(item.code, status)}
            </MenuItem>
          ))}
        </Select>
      ) : (
        <Box
          onClick={editable ? onOpen : undefined}
          data-testid={editable ? "editable-field" : undefined}
          sx={{
            display: "inline-block",
            cursor: editable ? "pointer" : "default",
            borderRadius: 0.5,
            px: editable ? 0.5 : 0,
            mx: editable ? -0.5 : 0,
            "&:hover": editable ? { bgcolor: "action.hover" } : undefined,
          }}
        >
          {blank ? (
            <NotRecorded />
          ) : (
            <Typography
              variant="body2"
              sx={{
                textDecoration: editable ? "underline" : "none",
                textUnderlineOffset: 3,
                textDecorationColor: "rgba(0,0,0,0.25)",
              }}
            >
              {closedLabel}
            </Typography>
          )}
        </Box>
      )}
      {error ? (
        <Typography variant="caption" color="error" sx={{ display: "block", mt: 0.25 }}>
          {error}
        </Typography>
      ) : null}
    </Row>
  );
}

function shortDay(occurredAt: Date): string {
  return formatDay(occurredAt.toISOString().slice(0, 10));
}

/**
 * Who, and when — the row's own provenance slot, `REQ-item-history` and
 * `REQ-item-states`'s player-claimed provenance. `WP-operator-record`
 * (LAN-217) rebuilds this from the item's own append-only history
 * (`onboarding-item-history.ts`) rather than the current row alone, which is
 * what lets it say **who** for every state rather than only "Completed
 * &lt;day&gt;", and what lets a resolved item still carry a trace of a player's
 * earlier trust-class claim once an operator confirms it.
 *
 * Narrative text does not belong here (`W6`'s own acceptance correction,
 * "nothing here blocks anything, ever" struck before approval) — every clause
 * this builds is an actor and a date, or a state word and a date, never a
 * sentence about what the state means.
 */
function provenanceNote(item: OnboardingItemDisplay): string | undefined {
  const history = item.history;
  if (history.length === 0) return undefined;

  const latest = history[history.length - 1];
  const who =
    latest.actorName ??
    (latest.actorKind === "player"
      ? "the player"
      : latest.actorKind === "system"
        ? "the system"
        : "an operator");
  const when = shortDay(latest.occurredAt);

  let head: string;
  // The one transition already folded into `head` above, so the trailing
  // summary below never repeats it — set only by the `complete` branch,
  // which names the player's own claim rather than the latest entry.
  let folded: OnboardingItemHistoryEntry | null = null;
  switch (latest.toStatus) {
    case "waived":
      head = latest.reason
        ? `Waived by ${who}, ${when} — ${latest.reason}`
        : `Waived by ${who}, ${when}`;
      break;
    // D-002 (correction round 6): no "Reopen" verb, on this row or anywhere
    // else — a transition back to the item's own off state (`pending`) is
    // named the same way any other transition is, in the item's own word.
    case "pending":
      head = `Set to ${itemStateLabel(item.code, "pending")} by ${who}, ${when}`;
      break;
    case "claimed":
      head = `${who}, ${when} · awaiting confirmation`;
      break;
    case "complete": {
      // `R2-V`: a trust-class item completes **on the player's own word** —
      // the note names the player who claimed it and when, not whichever
      // operator later clicked Complete to confirm what was already true.
      // Found by looking back through this same item's history for the claim
      // that led here.
      const claim = [...history]
        .reverse()
        .find((entry) => entry.toStatus === "claimed" && entry.actorKind === "player");
      if (claim) {
        const claimant = claim.actorName ?? "the player";
        head = `${claimant}, ${shortDay(claim.occurredAt)} · player-claimed`;
        folded = claim;
      } else {
        head = `${who}, ${when}`;
      }
      break;
    }
    default:
      head = `${who}, ${when}`;
  }

  if (history.length === 1) return head;

  const previous = history[history.length - 2];
  if (previous === folded) return head;

  const previousWord = itemStateLabel(item.code, previous.toStatus);
  const earlierCount = history.length - 2;
  const earlierSuffix =
    earlierCount > 0 ? ` · ${earlierCount} earlier change${earlierCount === 1 ? "" : "s"}` : "";
  return `${head} · ${previousWord} ${shortDay(previous.occurredAt)}${earlierSuffix}`;
}

function OtherSeasons({ seasons }: { seasons: readonly OtherSeasonSummary[] }) {
  if (seasons.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ py: 2 }} data-testid="no-other-seasons">
        No earlier seasons are recorded.
      </Typography>
    );
  }
  return (
    <Stack data-testid="other-seasons">
      {seasons.map((season, index) => (
        <Stack
          key={season.membershipId}
          direction="row"
          sx={{
            justifyContent: "space-between",
            alignItems: "center",
            py: 1.25,
            borderTop: index === 0 ? "none" : 1,
            borderColor: "divider",
          }}
        >
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              <Box
                component="a"
                href={`/operate/roster/${season.membershipId}`}
                sx={{ color: "primary.main", textDecoration: "none" }}
              >
                {season.seasonLabel}
              </Box>
            </Typography>
            {season.blueJerseyNumber ? (
              <Typography variant="caption" color="text.secondary">
                Blue {season.blueJerseyNumber}
              </Typography>
            ) : null}
          </Box>
          <Chip size="small" label={labelFor(MEMBERSHIP_STATUS_LABELS, season.status)} />
        </Stack>
      ))}
    </Stack>
  );
}

function StatusHistory({ history }: { history: readonly MembershipStatusEvent[] }) {
  if (history.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ py: 2 }} data-testid="status-history-empty">
        No recorded transition for this membership.
      </Typography>
    );
  }
  return (
    <Stack data-testid="status-history">
      {history.map((event, index) => {
        const from = event.fromStatus
          ? labelFor(MEMBERSHIP_STATUS_LABELS, event.fromStatus)
          : "Created as";
        const to = labelFor(MEMBERSHIP_STATUS_LABELS, event.toStatus);
        return (
          <Box
            key={`${event.toStatus}-${event.occurredAt.toISOString()}-${index}`}
            sx={{ py: 1.25, borderTop: index === 0 ? "none" : 1, borderColor: "divider" }}
          >
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              Status
            </Typography>
            <Typography variant="body2">
              {event.fromStatus ? `${from} → ${to}` : `${from} ${to.toLowerCase()}`}
            </Typography>
            <Typography variant="caption" color="text.secondary" component="p">
              <time dateTime={event.occurredAt.toISOString()}>{formatWhen(event.occurredAt)}</time>
              {" · "}
              {event.actorName ?? event.actorLabel ?? "a named process"}
              {event.reason ? ` · ${event.reason}` : ""}
            </Typography>
          </Box>
        );
      })}
    </Stack>
  );
}

/**
 * The sectioned activity log — `REQ-activity-log`, `OD7-log-by-section`.
 * Brian, 2026-09-02, on the first draft's one-line-per-section count: "that
 * is just not useful… I want to see the individual items that come
 * underneath, when it was asked versus when it was received." So this is
 * `StatusHistory`'s own markup above — a bordered entry, a bold label, a line
 * saying what happened, a caption of when and who — with one entry per ask
 * and per answer instead of a membership status transition. No new component:
 * the bold label is the section name, repeated on every entry in it, exactly
 * the way the mockup's own `replaceHistory` helper renders a (heading, what,
 * when) triple.
 */
function ActivityLog({ sections }: { sections: readonly OnboardingActivitySection[] }) {
  const hasEntries = sections.some((section) => section.entries.length > 0);
  if (!hasEntries) {
    return (
      <Typography color="text.secondary" sx={{ py: 2 }} data-testid="activity-log-empty">
        Nothing has been asked of this person yet.
      </Typography>
    );
  }
  const rows = sections.flatMap((section) =>
    section.entries.map((entry, index) => ({ section: section.section, entry, index })),
  );
  return (
    <Stack data-testid="activity-log">
      {rows.map(({ section, entry, index }, position) => (
        <Box
          key={`${section}-${entry.occurredAt.toISOString()}-${index}`}
          sx={{ py: 1.25, borderTop: position === 0 ? "none" : 1, borderColor: "divider" }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {section}
          </Typography>
          <Typography variant="body2">
            {entry.kind === "ask" ? `Asked — ${entry.channel}` : `Answered — ${entry.channel}`}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="p">
            <time dateTime={entry.occurredAt.toISOString()}>{formatWhen(entry.occurredAt)}</time>
            {" · "}
            {entry.who}
          </Typography>
        </Box>
      ))}
    </Stack>
  );
}

function currentContact(
  contacts: PersonRecord["contacts"] | undefined,
  kind: "email" | "phone",
  scope: "personal" | "college" | null,
): string | null {
  if (!contacts) return null;
  const matches = contacts.filter(
    (contact) =>
      contact.kind === kind &&
      contact.validUntil === null &&
      (scope === null || contact.scope === scope),
  );
  if (matches.length === 0) return null;
  const preferred = matches.find((contact) => contact.isPreferred);
  return (preferred ?? matches[0]).rawValue;
}

function joinAliases(aliases: PersonRecord["aliases"] | undefined): string | null {
  if (!aliases || aliases.length === 0) return null;
  const names = aliases.map((alias) => alias.alias);
  return names.length === 0 ? null : names.join(", ");
}

function formatEmergencyContact(
  contact: PersonRecord["emergencyContact"] | null | undefined,
): string | null {
  if (!contact) return null;
  const name = contact.familyName
    ? `${contact.givenName} ${contact.familyName}`
    : contact.givenName;
  const detail = [contact.relationship, contact.phone, contact.email].filter(Boolean).join(" · ");
  return detail ? `${name} — ${detail}` : name;
}
