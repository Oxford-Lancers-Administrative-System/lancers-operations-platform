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
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import type {
  MembershipStatus,
  MembershipStatusEvent,
  OnboardingItem,
} from "@/lib/services/membership";
import type { PersonRecord } from "@/lib/services/person-record";
import type {
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
import { NOT_RECORDED, NotRecorded, RecordField, Row, Section } from "../../record-shell";
import AttendanceSection from "./attendance-section";
import {
  ENTRY_LABELS,
  formatDay,
  formatWhen,
  labelFor,
  MEMBERSHIP_STATUS_LABELS,
  membershipStatusColour,
  ONBOARDING_ITEM_LABELS,
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

/** The three resolutions this screen offers — `OPERATOR_ITEM_RESOLUTIONS` in `membership.ts`. */
const ITEM_RESOLUTIONS = Object.freeze(["complete", "waived", "not_applicable"] as const);

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

  function resolveOnboardingItem(
    item: OnboardingItem,
    status: "complete" | "waived" | "not_applicable",
    reason?: string,
  ) {
    startTransition(() => {
      void runCommit(`item:${item.id}`, () =>
        recordResolveOnboardingItemAction({
          membershipId: record.membershipId,
          itemId: item.id,
          status,
          reason,
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
              error={fieldError?.key === `item:${item.id}` ? fieldError.message : null}
              onOpen={() => setEditing(`item:${item.id}`)}
              onClose={() => setEditing(null)}
              onResolve={(status, reason) => resolveOnboardingItem(item, status, reason)}
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
  header: "#4527a0",
  tint: "rgba(69, 39, 160, 0.05)",
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
 * Complete and Not applicable commit the moment they are chosen, exactly like
 * every other in-place edit. Waived is the one resolution the schema itself
 * requires a reason for (`onboarding_items_waiver_is_justified`) — chosen it
 * opens a reason field beneath instead of committing immediately, because
 * there is genuinely nothing to commit yet, not because this control asks a
 * reason of its own accord.
 */
function OnboardingRow({
  item,
  editing,
  readOnly,
  error,
  onOpen,
  onClose,
  onResolve,
}: {
  item: OnboardingItem;
  editing: boolean;
  readOnly: boolean;
  error: string | null;
  onOpen: () => void;
  onClose: () => void;
  onResolve: (status: "complete" | "waived" | "not_applicable", reason?: string) => void;
}) {
  const [awaitingReason, setAwaitingReason] = useState(false);
  const [reason, setReason] = useState("");
  const editable = !readOnly;

  function close() {
    setAwaitingReason(false);
    setReason("");
    onClose();
  }

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
      {editing && !awaitingReason ? (
        <Select
          size="small"
          open
          autoFocus
          value=""
          displayEmpty
          onClose={close}
          onChange={(event) => {
            const next = event.target.value as (typeof ITEM_RESOLUTIONS)[number];
            if (next === "waived") {
              setAwaitingReason(true);
              return;
            }
            onResolve(next);
          }}
          renderValue={() => labelFor(ONBOARDING_ITEM_LABELS, item.status)}
          sx={{ minWidth: 220 }}
        >
          {ITEM_RESOLUTIONS.map((status) => (
            <MenuItem key={status} value={status}>
              {labelFor(ONBOARDING_ITEM_LABELS, status)}
            </MenuItem>
          ))}
        </Select>
      ) : editing && awaitingReason ? (
        <Stack spacing={1} sx={{ maxWidth: 360 }} data-testid="onboarding-waiver-reason">
          <TextField
            label="Why is this waived?"
            size="small"
            multiline
            minRows={2}
            fullWidth
            autoFocus
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              size="small"
              sx={{ minHeight: 44 }}
              disabled={reason.trim() === ""}
              onClick={() => onResolve("waived", reason.trim())}
            >
              Save waiver
            </Button>
            <Button size="small" sx={{ minHeight: 44 }} onClick={close}>
              Cancel
            </Button>
          </Stack>
        </Stack>
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
          <Typography
            variant="body2"
            sx={{
              textDecoration: editable ? "underline" : "none",
              textUnderlineOffset: 3,
              textDecorationColor: "rgba(0,0,0,0.25)",
            }}
          >
            {labelFor(ONBOARDING_ITEM_LABELS, item.status)}
          </Typography>
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

function provenanceNote(item: OnboardingItem): string | undefined {
  if (item.waivedReason)
    return `Waived by ${item.waivedByName ?? "an operator"} — ${item.waivedReason}`;
  if (item.completedOn) return `Completed ${formatDay(item.completedOn)}`;
  return undefined;
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
