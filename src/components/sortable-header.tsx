import type { ReactNode } from "react";
import Link from "next/link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TableCell from "@mui/material/TableCell";
import TableSortLabel from "@mui/material/TableSortLabel";

/**
 * A column heading that is also the control for ordering by it — LAN-225,
 * brief §2. An href, so sorting works with scripting disabled; `scroll={false}`
 * so re-ordering doesn't bounce the reader to the top; `component="span"`
 * since a button inside an anchor is invalid HTML.
 */
export function SortableHeader({
  column,
  label,
  href,
  active,
  direction,
  align,
  testId,
  trailing,
  caption,
}: {
  column: string;
  label: ReactNode;
  href: string;
  active: boolean;
  direction: "asc" | "desc";
  align?: "left" | "right" | "center";
  testId?: string;
  /** LAN-511: beside the heading and outside its link — a column's filter funnel. */
  trailing?: ReactNode;
  /** LAN-511: under the heading — the filter in force, as the roster board shows it. */
  caption?: ReactNode;
}) {
  const link = (
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
  );
  return (
    <TableCell sortDirection={active ? direction : false} align={align}>
      {trailing === undefined ? (
        link
      ) : (
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
          {link}
          {trailing}
        </Stack>
      )}
      {caption}
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
