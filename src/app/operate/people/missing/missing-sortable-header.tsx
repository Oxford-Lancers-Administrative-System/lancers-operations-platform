import { SortableHeader as KitSortableHeader } from "@/components/sortable-header";
import { first } from "./missing-query";

/** One sortable column header for the missing-data queue's own query keys. */
export default function MissingSortableHeader({
  column,
  label,
  sort,
  direction,
  query,
}: {
  column: string;
  label: string;
  sort: string;
  direction: string;
  query: Record<string, string | string[] | undefined>;
}) {
  const active = sort === column;
  const next = active
    ? direction === "asc"
      ? "desc"
      : "asc"
    : column === "missing"
      ? "desc"
      : "asc";

  const params = new URLSearchParams();
  for (const key of ["q", "status", "fact", "scope", "players"]) {
    const value = first(query[key]);
    if (value !== "") params.set(key, value);
  }
  params.set("sort", column);
  params.set("dir", next);

  return (
    <KitSortableHeader
      column={column}
      label={label}
      active={active}
      direction={active && direction === "desc" ? "desc" : "asc"}
      href={`/operate/people/missing?${params.toString()}`}
    />
  );
}
