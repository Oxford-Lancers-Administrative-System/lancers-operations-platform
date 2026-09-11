import { SortableHeader as KitSortableHeader } from "@/components/sortable-header";

/**
 * One sortable column header, shared by both lists. LAN-153. A link, not a
 * button: sorting belongs in the URL. `REQ-list-shape`'s "Term and week sorts
 * identically to Date" is arranged upstream in `EVENT_SORT_COLUMNS`, not here.
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
