import Typography from "@mui/material/Typography";
import { RecordField } from "@/components/record-field";
import { Section } from "@/components/section";
import {
  SPECIAL_TEAMS_SLOTS,
  SPECIAL_TEAMS_SQUADS,
  specialTeamsCellKey,
} from "@/lib/services/roster-board/vocabulary";

/**
 * The record's Special teams assignments group — LAN-374. Six squads, four
 * cells each, twenty-four in all, collapsed on arrival. Bold squad, italic
 * slot: the sheet's own shape, not a depth chart, and no cell means anything
 * to any other.
 */
export default function SpecialTeamsSection({
  assignments,
  editing,
  locked,
  savingOf,
  errorFor,
  setEditing,
  commitSeasonField,
}: {
  assignments: Readonly<Record<string, string>>;
  editing: string | null;
  locked: boolean;
  savingOf: (key: string) => boolean;
  errorFor: (key: string) => string | null;
  setEditing: (key: string | null) => void;
  commitSeasonField: (key: string, next: string | string[]) => void;
}) {
  return (
    <Section
      variant="banded"
      band="specialTeams"
      title="Special teams assignments"
      testId="special-teams"
      collapsible
    >
      {SPECIAL_TEAMS_SQUADS.map((squad) => (
        <div key={squad.squad} data-testid={`special-teams-squad-${squad.squad}`}>
          <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 700, mt: 1.5, mb: 0.5 }}>
            {squad.label}
          </Typography>
          {SPECIAL_TEAMS_SLOTS.map((slot) => {
            const key = specialTeamsCellKey(squad.squad, slot.slot);
            return (
              <RecordField
                key={key}
                label={slot.label}
                labelItalic
                value={assignments[key] ?? null}
                options={[...squad.positions]}
                editing={editing === key}
                readOnly={locked}
                saving={savingOf(key)}
                error={errorFor(key)}
                onOpen={() => setEditing(key)}
                onClose={() => setEditing(null)}
                onCommit={(next) => commitSeasonField(key, next)}
                rawValue={assignments[key] ?? null}
              />
            );
          })}
        </div>
      ))}
    </Section>
  );
}
