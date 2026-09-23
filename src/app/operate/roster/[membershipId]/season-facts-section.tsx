import { RecordField } from "@/components/record-field";
import { Section } from "@/components/section";
import type { PlayerRecordData } from "@/lib/services/player-record";
import {
  type RecordGroup,
  AVAILABILITY_LABELS,
  AVAILABILITY_VALUES,
  BLUES_VALUES,
  COACHING_GROUPS,
  DEFENSIVE_POSITION_GROUPS,
  ELIGIBILITY_LABELS,
  ELIGIBILITY_VALUES,
  ENTRIES,
  FORMALWEAR_ITEMS,
  FORMALWEAR_LABELS,
  OFFENSIVE_POSITION_GROUPS,
  STATUS_OPTION_LABELS,
  STATUSES,
  WARMUP_SMALL_GROUPS,
} from "../board-columns";
import { ENTRY_LABELS, formatDay, labelFor, MEMBERSHIP_STATUS_LABELS } from "../presentation";
import PositionField from "./position-field";
import JerseyField from "./jersey-field";
import MultiSelectField from "./multi-select-field";
import SpecialTeamsSection from "./special-teams-section";
import KitItemsFields from "./kit-items-fields";

/**
 * The membership record's own groups — the same ones the board shows, in the
 * same order (LAN-387). The editing state and the commit switch stay on
 * `PlayerRecordView`; this is structure only, wired through callback props
 * exactly like the board's own `Cell`.
 */
export default function SeasonFactsSection({
  record,
  editing,
  closed,
  savingKey,
  fieldErrorKey,
  fieldErrorMessage,
  setEditing,
  commitSeasonField,
  collapsedGroups,
  onToggleGroup,
}: {
  record: PlayerRecordData;
  editing: string | null;
  closed: boolean;
  /** The one field whose save is in flight — LAN-380. It takes no further edit until it is back. */
  savingKey: string | null;
  fieldErrorKey: string | null;
  fieldErrorMessage: string | null;
  setEditing: (key: string | null) => void;
  commitSeasonField: (key: string, next: string | string[]) => void;
  /** Which groups this operator has folded away, from their account — LAN-387, Brian's visual pass item 1; every group since LAN-403. */
  collapsedGroups: ReadonlySet<RecordGroup>;
  onToggleGroup: (group: RecordGroup, open: boolean) => void;
}) {
  const errorFor = (key: string) => (fieldErrorKey === key ? fieldErrorMessage : null);
  const savingOf = (key: string) => savingKey === key;
  /**
   * While any one field is saving, the whole panel takes no edit — LAN-380.
   *
   * Not tidiness: every editor here is built from the last server render, and a
   * commit fired while another field's `revalidatePath` refresh is still in
   * flight aborts that refresh. The next editor then opens on a value the
   * server has already moved past and writes it back. Measured on a production
   * build under a Slow 3G profile: ten edits alternating the two jersey kits,
   * and only the last of each survived. One save at a time is what makes each
   * editor's starting value true.
   */
  const locked = closed || savingKey !== null;

  /** The five props every field in here wires the same way. */
  const common = (key: string) => ({
    editing: editing === key,
    readOnly: locked,
    saving: savingOf(key),
    error: errorFor(key),
    onOpen: () => setEditing(key),
    onClose: () => setEditing(null),
  });

  return (
    <>
      <Section
        variant="banded"
        band="membership"
        title={`Membership · ${record.seasonLabel}`}
        testId="season"
        collapsible
        defaultOpen={!collapsedGroups.has("membership")}
        onToggleOpen={(open) => onToggleGroup("membership", open)}
      >
        <RecordField
          label="Status"
          value={labelFor(MEMBERSHIP_STATUS_LABELS, record.status)}
          status={{ domain: "membership", code: record.status }}
          options={[...STATUSES]}
          optionLabels={STATUS_OPTION_LABELS}
          {...common("status")}
          onCommit={(next) => commitSeasonField("status", next)}
          rawValue={record.status}
          note={closed ? "This season is over. Nothing here changes it." : undefined}
        />
        <RecordField
          label="Entry"
          value={labelFor(ENTRY_LABELS, record.entry)}
          options={[...ENTRIES]}
          {...common("entry")}
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

        <JerseyField
          label="Jersey — Blue"
          held={record.season.blueNumbers}
          holders={record.jerseyHolders.blue}
          {...common("blueNumbers")}
          onCommit={(next) => commitSeasonField("blueNumbers", next)}
        />
        <JerseyField
          label="Jersey — White"
          held={record.season.whiteNumbers}
          holders={record.jerseyHolders.white}
          {...common("whiteNumbers")}
          onCommit={(next) => commitSeasonField("whiteNumbers", next)}
        />

        <RecordField
          label="Half / Full Blue"
          value={record.season.blues}
          options={[...BLUES_VALUES]}
          {...common("blues")}
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
          {...common("eligibility")}
          onCommit={(next) => commitSeasonField("eligibility", next)}
          rawValue={record.season.eligibility}
        />
        <RecordField
          label="BPS"
          value={record.season.bps}
          options={["Yes", "No"]}
          {...common("bps")}
          onCommit={(next) => commitSeasonField("bps", next)}
          rawValue={record.season.bps}
        />
      </Section>

      {/* LAN-412 — Availability is its own section, in the same banded idiom
          and the same place in the order as the board's own group. The field,
          its values and its write are exactly what they were inside
          Membership; only the band around them is new. */}
      <Section
        variant="banded"
        band="availability"
        title="Availability"
        testId="availability"
        collapsible
        defaultOpen={!collapsedGroups.has("availability")}
        onToggleOpen={(open) => onToggleGroup("availability", open)}
      >
        <RecordField
          label="Availability"
          value={
            record.season.availability
              ? labelFor(AVAILABILITY_LABELS, record.season.availability)
              : null
          }
          options={[...AVAILABILITY_VALUES]}
          optionLabels={AVAILABILITY_LABELS}
          {...common("availability")}
          onCommit={(next) => commitSeasonField("availability", next)}
          rawValue={record.season.availability}
        />
      </Section>

      <Section
        variant="banded"
        band="coaching"
        title="Coaching assignments"
        testId="coaching"
        collapsible
        defaultOpen={!collapsedGroups.has("coaching")}
        onToggleOpen={(open) => onToggleGroup("coaching", open)}
      >
        <MultiSelectField
          label="Coaching group"
          values={record.season.coachingGroups}
          options={COACHING_GROUPS}
          {...common("coachingGroups")}
          onCommit={(next) => commitSeasonField("coachingGroups", next)}
        />
        <MultiSelectField
          label="Offensive position group"
          values={record.season.offensivePositionGroups}
          options={OFFENSIVE_POSITION_GROUPS}
          {...common("offensivePositionGroups")}
          onCommit={(next) => commitSeasonField("offensivePositionGroups", next)}
        />
        <MultiSelectField
          label="Defensive position group"
          values={record.season.defensivePositionGroups}
          options={DEFENSIVE_POSITION_GROUPS}
          {...common("defensivePositionGroups")}
          onCommit={(next) => commitSeasonField("defensivePositionGroups", next)}
        />
      </Section>

      <Section
        variant="banded"
        band="offensive"
        title="Offensive assignments"
        testId="offensive"
        collapsible
        defaultOpen={!collapsedGroups.has("offensive")}
        onToggleOpen={(open) => onToggleGroup("offensive", open)}
      >
        <PositionField
          label="Primary position"
          value={record.season.offencePosition}
          options={record.positionOptions.offence}
          {...common("offencePosition")}
          onCommit={(next) => commitSeasonField("offencePosition", next)}
        />
        <PositionField
          label="Backup position"
          value={record.season.offenceBackupPosition}
          options={record.positionOptions.offence}
          {...common("offenceBackupPosition")}
          onCommit={(next) => commitSeasonField("offenceBackupPosition", next)}
        />
      </Section>

      <Section
        variant="banded"
        band="defensive"
        title="Defensive assignments"
        testId="defensive"
        collapsible
        defaultOpen={!collapsedGroups.has("defensive")}
        onToggleOpen={(open) => onToggleGroup("defensive", open)}
      >
        <PositionField
          label="Primary position"
          value={record.season.defencePosition}
          options={record.positionOptions.defence}
          {...common("defencePosition")}
          onCommit={(next) => commitSeasonField("defencePosition", next)}
        />
        <PositionField
          label="Backup position"
          value={record.season.defenceBackupPosition}
          options={record.positionOptions.defence}
          {...common("defenceBackupPosition")}
          onCommit={(next) => commitSeasonField("defenceBackupPosition", next)}
        />
      </Section>

      <SpecialTeamsSection
        open={!collapsedGroups.has("specialTeams")}
        onToggleOpen={(open) => onToggleGroup("specialTeams", open)}
        assignments={record.season.specialTeams}
        editing={editing}
        locked={locked}
        savingOf={savingOf}
        errorFor={errorFor}
        setEditing={setEditing}
        commitSeasonField={commitSeasonField}
      />

      {/* LAN-401 — Stewart's warmup small groups. One cell, collapsed on arrival
          like the two groups either side of it. */}
      <Section
        variant="banded"
        band="warmup"
        title="Warmup assignments"
        testId="warmup"
        collapsible
        defaultOpen={!collapsedGroups.has("warmup")}
        onToggleOpen={(open) => onToggleGroup("warmup", open)}
      >
        <RecordField
          label="Small Group Assignment"
          value={record.season.warmupSmallGroup}
          options={[...WARMUP_SMALL_GROUPS]}
          {...common("warmupSmallGroup")}
          onCommit={(next) => commitSeasonField("warmupSmallGroup", next)}
          rawValue={record.season.warmupSmallGroup}
        />
      </Section>

      <Section
        variant="banded"
        band="kit"
        title="Kit"
        testId="kit"
        collapsible
        defaultOpen={!collapsedGroups.has("kit")}
        onToggleOpen={(open) => onToggleGroup("kit", open)}
      >
        <KitItemsFields
          items={record.season.kit}
          editing={editing}
          locked={locked}
          savingOf={savingOf}
          errorFor={errorFor}
          setEditing={setEditing}
          commitSeasonField={commitSeasonField}
        />
        <MultiSelectField
          label="Formalwear"
          values={FORMALWEAR_ITEMS.filter((item) => record.season.formalwear[item])}
          options={[...FORMALWEAR_ITEMS]}
          optionLabels={FORMALWEAR_LABELS}
          {...common("formalwear")}
          onCommit={(next) => commitSeasonField("formalwear", next)}
        />
      </Section>
    </>
  );
}
