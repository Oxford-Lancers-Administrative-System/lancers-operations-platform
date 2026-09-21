import { RecordField } from "@/components/record-field";
import { KIT_ITEMS, kitCellKey } from "@/lib/services/roster-board/vocabulary";
import MultiSelectField from "./multi-select-field";

/**
 * The eleven issued-kit items — LAN-375, Clint's kit sheet. Nine are a single
 * select, blank or one value. Braces L and Braces R hold a set of the same
 * twelve brace values each (LAN-409, Stewart's ask and Brian's decision of
 * 2026-09-21), in the multi-select idiom Formalwear already uses below them.
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
  items: Readonly<Record<string, readonly string[]>>;
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
        const held = items[key] ?? [];
        const common = {
          label: item.label,
          options: [...item.values],
          editing: editing === key,
          readOnly: locked,
          saving: savingOf(key),
          error: errorFor(key),
          onOpen: () => setEditing(key),
          onClose: () => setEditing(null),
          onCommit: (next: string | string[]) => commitSeasonField(key, next),
        };

        if (item.multi) {
          return <MultiSelectField key={key} {...common} values={[...held]} />;
        }
        return (
          <RecordField key={key} {...common} value={held[0] ?? null} rawValue={held[0] ?? null} />
        );
      })}
    </>
  );
}
