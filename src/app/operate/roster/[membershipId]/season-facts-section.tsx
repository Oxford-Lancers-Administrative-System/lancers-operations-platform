import { RecordField } from "@/components/record-field";
import { Section } from "@/components/section";
import type { FormalwearItemKey } from "@/lib/services/roster-board";
import type { PlayerRecordData } from "@/lib/services/player-record";
import {
  AVAILABILITY_LABELS,
  AVAILABILITY_VALUES,
  BLUES_VALUES,
  COACH_GROUPS,
  ELIGIBILITY_LABELS,
  ELIGIBILITY_VALUES,
  ENTRIES,
  STATUS_OPTION_LABELS,
  STATUSES,
} from "../board-columns";
import { ENTRY_LABELS, formatDay, labelFor, MEMBERSHIP_STATUS_LABELS } from "../presentation";
import PositionField from "./position-field";
import JerseyField from "./jersey-field";
import FormalwearField from "./formalwear-field";

/**
 * The Season band: every in-place-editable season fact, one `Section`. The
 * editing state and the commit switch stay on `PlayerRecordView` — this is
 * structure only, wired through callback props exactly like the board's own
 * `Cell`.
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
  toggleFormalwear,
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
  toggleFormalwear: (item: FormalwearItemKey, owned: boolean) => void;
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

  return (
    <Section
      variant="banded"
      band="season"
      title={`Season · ${record.seasonLabel}`}
      testId="season"
    >
      <RecordField
        label="Status"
        value={labelFor(MEMBERSHIP_STATUS_LABELS, record.status)}
        status={{ domain: "membership", code: record.status }}
        options={[...STATUSES]}
        optionLabels={STATUS_OPTION_LABELS}
        editing={editing === "status"}
        readOnly={locked}
        saving={savingOf("status")}
        error={errorFor("status")}
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
        readOnly={locked}
        saving={savingOf("entry")}
        error={errorFor("entry")}
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
        readOnly={locked}
        saving={savingOf("offencePosition")}
        error={errorFor("offencePosition")}
        onOpen={() => setEditing("offencePosition")}
        onClose={() => setEditing(null)}
        onCommit={(next) => commitSeasonField("offencePosition", next)}
      />
      <PositionField
        label="Defence"
        value={record.season.defencePosition}
        options={record.positionOptions.defence}
        editing={editing === "defencePosition"}
        readOnly={locked}
        saving={savingOf("defencePosition")}
        error={errorFor("defencePosition")}
        onOpen={() => setEditing("defencePosition")}
        onClose={() => setEditing(null)}
        onCommit={(next) => commitSeasonField("defencePosition", next)}
      />
      <PositionField
        label="Special teams"
        value={record.season.specialTeamsPosition}
        options={record.positionOptions.specialTeams}
        editing={editing === "specialTeamsPosition"}
        readOnly={locked}
        saving={savingOf("specialTeamsPosition")}
        error={errorFor("specialTeamsPosition")}
        onOpen={() => setEditing("specialTeamsPosition")}
        onClose={() => setEditing(null)}
        onCommit={(next) => commitSeasonField("specialTeamsPosition", next)}
      />

      <JerseyField
        label="Jersey — Blue"
        held={record.season.blueNumbers}
        holders={record.jerseyHolders.blue}
        editing={editing === "blueNumbers"}
        readOnly={locked}
        saving={savingOf("blueNumbers")}
        error={errorFor("blueNumbers")}
        onOpen={() => setEditing("blueNumbers")}
        onClose={() => setEditing(null)}
        onCommit={(next) => commitSeasonField("blueNumbers", next)}
      />
      <JerseyField
        label="Jersey — White"
        held={record.season.whiteNumbers}
        holders={record.jerseyHolders.white}
        editing={editing === "whiteNumbers"}
        readOnly={locked}
        saving={savingOf("whiteNumbers")}
        error={errorFor("whiteNumbers")}
        onOpen={() => setEditing("whiteNumbers")}
        onClose={() => setEditing(null)}
        onCommit={(next) => commitSeasonField("whiteNumbers", next)}
      />

      <RecordField
        label="Coach group"
        value={record.season.coachGroup}
        options={[...COACH_GROUPS]}
        editing={editing === "coachGroup"}
        readOnly={locked}
        saving={savingOf("coachGroup")}
        error={errorFor("coachGroup")}
        onOpen={() => setEditing("coachGroup")}
        onClose={() => setEditing(null)}
        onCommit={(next) => commitSeasonField("coachGroup", next)}
        rawValue={record.season.coachGroup}
      />

      <FormalwearField
        season={record.season}
        editing={editing === "formalwear"}
        readOnly={locked}
        saving={savingOf("formalwear")}
        error={errorFor("formalwear")}
        onOpen={() => setEditing("formalwear")}
        onClose={() => setEditing(null)}
        onToggle={toggleFormalwear}
      />

      <RecordField
        label="Half / Full Blue"
        value={record.season.blues}
        options={[...BLUES_VALUES]}
        editing={editing === "blues"}
        readOnly={locked}
        saving={savingOf("blues")}
        error={errorFor("blues")}
        onOpen={() => setEditing("blues")}
        onClose={() => setEditing(null)}
        onCommit={(next) => commitSeasonField("blues", next)}
        rawValue={record.season.blues}
      />
      <RecordField
        label="Eligibility"
        value={
          record.season.eligibility ? labelFor(ELIGIBILITY_LABELS, record.season.eligibility) : null
        }
        options={[...ELIGIBILITY_VALUES]}
        optionLabels={ELIGIBILITY_LABELS}
        editing={editing === "eligibility"}
        readOnly={locked}
        saving={savingOf("eligibility")}
        error={errorFor("eligibility")}
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
        readOnly={locked}
        saving={savingOf("availability")}
        error={errorFor("availability")}
        onOpen={() => setEditing("availability")}
        onClose={() => setEditing(null)}
        onCommit={(next) => commitSeasonField("availability", next)}
        rawValue={record.season.availability}
      />
    </Section>
  );
}
