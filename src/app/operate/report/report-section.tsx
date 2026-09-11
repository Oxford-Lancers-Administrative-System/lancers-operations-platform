import { Section as KitSection } from "@/components/section";
import { StatusChip, type StatusDomain } from "@/components/status-chip";
import { RowCard } from "@/components/row-card";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";

/** Shared by every grid section: which column and which way. */
export interface GridSortState {
  by: "issues" | "person";
  ascending: boolean;
}

/**
 * A section: a heading that carries its own count and the span it covers, and
 * either its body or the one sentence that says there is none.
 */
export function ReportSection({
  testId,
  headline,
  count,
  span,
  empty,
  showCount = true,
  children,
}: {
  testId: string;
  headline: string;
  count: number;
  span?: string;
  empty: string;
  /**
   * Brian, 15 August: "Don't include the number. The numbers don't really
   * help." True of the two sections that already carry a date — the span says
   * what the section is about better than a tally of its rows does.
   */
  showCount?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Box data-count={count}>
      <KitSection
        title={`${headline}${showCount ? ` · ${count}` : ""}`}
        description={span}
        testId={testId}
      >
        {count === 0 ? (
          <Typography variant="body2" color="text.secondary" data-testid={`empty-${testId}`}>
            {empty}
          </Typography>
        ) : (
          children
        )}
      </KitSection>
    </Box>
  );
}

/** A column head that is also the control for ordering by it. */
export function SortHeader({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Button
      href={href}
      size="small"
      sx={{
        p: 0,
        minWidth: 0,
        textTransform: "none",
        fontWeight: active ? 700 : 600,
        color: active ? "primary.main" : "text.primary",
      }}
    >
      {label}
    </Button>
  );
}

/** A name, an optional badge, and a line of detail. */
export function Row({
  primary,
  secondary,
  badge,
  badgeDomain,
  badgeStatus,
}: {
  primary: string;
  secondary: string;
  badge: string | null;
  badgeDomain?: StatusDomain;
  badgeStatus?: string;
}) {
  return (
    <Box component="li">
      <RowCard
        title={primary}
        sublines={[secondary]}
        chips={
          badge && badgeDomain && badgeStatus ? (
            <StatusChip domain={badgeDomain} status={badgeStatus} label={badge} />
          ) : undefined
        }
      />
    </Box>
  );
}
