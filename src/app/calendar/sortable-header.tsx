import { SortableHeader as KitSortableHeader } from "@/components/sortable-header";

/**
 * One sortable column header, shared by both lists. LAN-153.
 *
 * A link rather than a button: sorting is a different view of the same list, so
 * it belongs in the URL, works with the back button, and survives a refresh.
 * Clicking the active column flips its direction; clicking another takes that
 * column's own default, because "soonest first" and "A to Z" are each the useful
 * starting point for their own column.
 *
 * `REQ-list-shape` requires that **Term and week sorts identically to Date**, and
 * this component is not where that is arranged: both columns resolve to the same
 * SQL expression in `EVENT_SORT_COLUMNS`, so the two headers are two ways of
 * asking for one ordering rather than two orderings that agree.
 */
export interface SortLink {
  /** The sort key this header owns — `date`, `term`, `name`, … */
  column: string;
  href: string;
}

export default function SortableHeader({
  link,
  sort,
  direction,
  align,
  children,
}: {
  link: SortLink;
  sort: string;
  direction: string;
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  const active = sort === link.column;

  return (
    <KitSortableHeader
      column={link.column}
      label={children}
      href={link.href}
      active={active}
      direction={active && direction === "asc" ? "asc" : "desc"}
      align={align}
      testId={`sort-${link.column}`}
    />
  );
}
