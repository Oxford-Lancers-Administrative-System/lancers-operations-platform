import { RecordField } from "@/components/record-field";
import { KIT_ITEMS, kitCellKey } from "@/lib/services/roster-board/vocabulary";

/**
 * The eleven issued-kit items — LAN-375, Clint's kit sheet. One single-select
 * each, blank or one value. Braces 1 and Braces 2 are two plain fields over
 * one list, with no count anywhere (Brian, 2026-09-16).
 */
export default function KitItemsFields({
  items,
  editing,
  locked,
  savingOf,
  errorFor,
  setEditing,
  commitSeasonField,
}: {
  items: Readonly<Record<string, string>>;
  editing: string | null;
  locked: boolean;
  savingOf: (key: string) => boolean;
  errorFor: (key: string) => string | null;
  setEditing: (key: string | null) => void;
  commitSeasonField: (key: string, next: string | string[]) => void;
}) {
  return (
    <>
      {KIT_ITEMS.map((item) => {
        const key = kitCellKey(item.item);
        return (
          <RecordField
            key={key}
            label={item.label}
            value={items[key] ?? null}
            options={[...item.values]}
            editing={editing === key}
            readOnly={locked}
            saving={savingOf(key)}
            error={errorFor(key)}
            onOpen={() => setEditing(key)}
            onClose={() => setEditing(null)}
            onCommit={(next) => commitSeasonField(key, next)}
            rawValue={items[key] ?? null}
          />
        );
      })}
    </>
  );
}
