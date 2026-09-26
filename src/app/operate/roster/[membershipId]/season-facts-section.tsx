import { RecordField } from "@/components/record-field";
import { Section } from "@/components/section";
import type { CategoryLevel, RosterCategory } from "@/lib/auth/grants";
import {
  FULL_RECORD_ACCESS,
  type RecordAccess,
  type VisiblePlayerRecord,
} from "@/lib/services/player-record-access";
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
  access = FULL_RECORD_ACCESS,
}: {
  /** Narrowed on the server: a `none` category's facts are absent (LAN-432). */
  record: VisiblePlayerRecord;
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
  /** LAN-432 — the seat's level on each category: `none` locks a group, `view` makes it text. */
  access?: RecordAccess;
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

  const level = (category: RosterCategory): CategoryLevel => access[category];

  /** The five props every field in here wires the same way; a `view` category is read-only. */
  const common = (key: string, category: RosterCategory) => ({
    editing: editing === key,
    readOnly: locked || level(category) === "view",
    saving: savingOf(key),
    error: errorFor(key),
    onOpen: () => setEditing(key),
    onClose: () => setEditing(null),
  });

  return (
    <>
      {level("membership") === "none" ? (
        <Section
          variant="banded"
          band="membership"
          title={`Membership · ${record.seasonLabel}`}
          testId="season"
          locked
        />
      ) : (
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
            value={labelFor(MEMBERSHIP_STATUS_LABELS, record.status ?? "")}
            status={{ domain: "membership", code: record.status ?? "" }}
            options={[...STATUSES]}
            optionLabels={STATUS_OPTION_LABELS}
            {...common("status", "membership")}
            onCommit={(next) => commitSeasonField("status", next)}
            rawValue={record.status ?? null}
            note={closed ? "This season is over. Nothing here changes it." : undefined}
          />
          <RecordField
            label="Entry"
            value={labelFor(ENTRY_LABELS, record.entry ?? "")}
            options={[...ENTRIES]}
            {...common("entry", "membership")}
            onCommit={(next) => commitSeasonField("entry", next)}
            rawValue={record.entry ?? null}
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
            held={record.season.blueNumbers ?? []}
            holders={record.jerseyHolders?.blue ?? {}}
            {...common("blueNumbers", "membership")}
            onCommit={(next) => commitSeasonField("blueNumbers", next)}
          />
          <JerseyField
            label="Jersey — White"
            held={record.season.whiteNumbers ?? []}
            holders={record.jerseyHolders?.white ?? {}}
            {...common("whiteNumbers", "membership")}
            onCommit={(next) => commitSeasonField("whiteNumbers", next)}
          />

          <RecordField
            label="Half / Full Blue"
            value={record.season.blues ?? null}
            options={[...BLUES_VALUES]}
            {...common("blues", "membership")}
            onCommit={(next) => commitSeasonField("blues", next)}
            rawValue={record.season.blues ?? null}
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
            {...common("eligibility", "membership")}
            onCommit={(next) => commitSeasonField("eligibility", next)}
            rawValue={record.season.eligibility ?? null}
          />
          <RecordField
            label="BPS"
            value={record.season.bps ?? null}
            options={["Yes", "No"]}
            {...common("bps", "membership")}
            onCommit={(next) => commitSeasonField("bps", next)}
            rawValue={record.season.bps ?? null}
          />
        </Section>
      )}

      {/* LAN-412 — Availability is its own section, in the same banded idiom
          and the same place in the order as the board's own group. The field,
          its values and its write are exactly what they were inside
          Membership; only the band around them is new. */}
      {level("availability") === "none" ? (
        <Section
          variant="banded"
          band="availability"
          title={"Availability"}
          testId="availability"
          locked
        />
      ) : (
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
            {...common("availability", "availability")}
            onCommit={(next) => commitSeasonField("availability", next)}
            rawValue={record.season.availability ?? null}
          />
        </Section>
      )}

      {level("coaching") === "none" ? (
        <Section
          variant="banded"
          band="coaching"
          title={"Coaching assignments"}
          testId="coaching"
          locked
        />
      ) : (
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
            values={record.season.coachingGroups ?? []}
            options={COACHING_GROUPS}
            {...common("coachingGroups", "coaching")}
            onCommit={(next) => commitSeasonField("coachingGroups", next)}
          />
          <MultiSelectField
            label="Offensive position group"
            values={record.season.offensivePositionGroups ?? []}
            options={OFFENSIVE_POSITION_GROUPS}
            {...common("offensivePositionGroups", "coaching")}
            onCommit={(next) => commitSeasonField("offensivePositionGroups", next)}
          />
          <MultiSelectField
            label="Defensive position group"
            values={record.season.defensivePositionGroups ?? []}
            options={DEFENSIVE_POSITION_GROUPS}
            {...common("defensivePositionGroups", "coaching")}
            onCommit={(next) => commitSeasonField("defensivePositionGroups", next)}
          />
        </Section>
      )}

      {level("offensive") === "none" ? (
        <Section
          variant="banded"
          band="offensive"
          title={"Offensive assignments"}
          testId="offensive"
          locked
        />
      ) : (
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
            value={record.season.offencePosition ?? null}
            options={record.positionOptions.offence}
            {...common("offencePosition", "offensive")}
            onCommit={(next) => commitSeasonField("offencePosition", next)}
          />
          <PositionField
            label="Backup position"
            value={record.season.offenceBackupPosition ?? null}
            options={record.positionOptions.offence}
            {...common("offenceBackupPosition", "offensive")}
            onCommit={(next) => commitSeasonField("offenceBackupPosition", next)}
          />
        </Section>
      )}

      {level("defensive") === "none" ? (
        <Section
          variant="banded"
          band="defensive"
          title={"Defensive assignments"}
          testId="defensive"
          locked
        />
      ) : (
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
            value={record.season.defencePosition ?? null}
            options={record.positionOptions.defence}
            {...common("defencePosition", "defensive")}
            onCommit={(next) => commitSeasonField("defencePosition", next)}
          />
          <PositionField
            label="Backup position"
            value={record.season.defenceBackupPosition ?? null}
            options={record.positionOptions.defence}
            {...common("defenceBackupPosition", "defensive")}
            onCommit={(next) => commitSeasonField("defenceBackupPosition", next)}
          />
        </Section>
      )}

      {level("special_teams") === "none" ? (
        <Section
          variant="banded"
          band="specialTeams"
          title="Special teams assignments"
          testId="special-teams"
          locked
        />
      ) : (
        <SpecialTeamsSection
          open={!collapsedGroups.has("specialTeams")}
          onToggleOpen={(open) => onToggleGroup("specialTeams", open)}
          assignments={record.season.specialTeams ?? {}}
          editing={editing}
          locked={locked || level("special_teams") === "view"}
          savingOf={savingOf}
          errorFor={errorFor}
          setEditing={setEditing}
          commitSeasonField={commitSeasonField}
        />
      )}

      {/* LAN-401 — Stewart's warmup small groups. One cell, collapsed on arrival
          like the two groups either side of it. */}
      {level("warmup") === "none" ? (
        <Section
          variant="banded"
          band="warmup"
          title={"Warmup assignments"}
          testId="warmup"
          locked
        />
      ) : (
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
            value={record.season.warmupSmallGroup ?? null}
            options={[...WARMUP_SMALL_GROUPS]}
            {...common("warmupSmallGroup", "warmup")}
            onCommit={(next) => commitSeasonField("warmupSmallGroup", next)}
            rawValue={record.season.warmupSmallGroup ?? null}
          />
        </Section>
      )}

      {level("kit") === "none" ? (
        <Section variant="banded" band="kit" title={"Kit"} testId="kit" locked />
      ) : (
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
            items={record.season.kit ?? {}}
            editing={editing}
            locked={locked || level("kit") === "view"}
            savingOf={savingOf}
            errorFor={errorFor}
            setEditing={setEditing}
            commitSeasonField={commitSeasonField}
          />
          <MultiSelectField
            label="Formalwear"
            values={FORMALWEAR_ITEMS.filter((item) => record.season.formalwear?.[item])}
            options={[...FORMALWEAR_ITEMS]}
            optionLabels={FORMALWEAR_LABELS}
            {...common("formalwear", "kit")}
            onCommit={(next) => commitSeasonField("formalwear", next)}
          />
        </Section>
      )}
    </>
  );
}
