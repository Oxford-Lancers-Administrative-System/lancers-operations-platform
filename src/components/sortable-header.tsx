import type { ReactNode } from "react";
import Link from "next/link";
import Paper from "@mui/material/Paper";
import TableCell from "@mui/material/TableCell";
import TableSortLabel from "@mui/material/TableSortLabel";

/**
 * A column heading that is also the control for ordering by it — LAN-225,
 * brief §2. Replaces four implementations (audit inventory) with the one the
 * participation table settled: an href, so sorting works with scripting
 * disabled and the back button undoes it; `scroll={false}`, so re-ordering a
 * table the reader is part-way down does not bounce them to the top;
 * `component="span"`, because a button inside an anchor is invalid HTML.
 * Behaviour unchanged; only the markup is shared.
 */
export function SortableHeader({
  column,
  label,
  href,
  active,
  direction,
  align,
  testId,
}: {
  column: string;
  label: ReactNode;
  href: string;
  active: boolean;
  direction: "asc" | "desc";
  align?: "left" | "right" | "center";
  testId?: string;
}) {
  return (
    <TableCell sortDirection={active ? direction : false} align={align}>
      <Link
        href={href}
        data-sort={column}
        data-testid={testId}
        style={{ color: "inherit", textDecoration: "none" }}
        scroll={false}
      >
        <TableSortLabel active={active} direction={direction} component="span">
          {label}
        </TableSortLabel>
      </Link>
    </TableCell>
  );
}

/** The outlined, horizontally scrolling frame every desktop table sits in. */
export function TableFrame({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <Paper variant="outlined" sx={{ overflowX: "auto" }} data-testid={testId}>
      {children}
    </Paper>
  );
}
