import Button from "@mui/material/Button";
import { EmptyState } from "@/components/empty-state";
import type { PeopleScope } from "@/lib/services/people-directory";

/**
 * Two distinguishable outcomes — `W7-04` and `W7-05` — and neither is a
 * failure. Nobody missing anything is a good outcome and says so; a filter
 * matching nothing offers to clear it, matching the roster's own distinction
 * between a filtered empty and a system empty.
 */
export default function EmptyQueue({
  totalMissing,
  scope,
  outsideHref,
}: {
  totalMissing: number;
  scope: PeopleScope;
  outsideHref: string;
}) {
  const nothingMissingAtAll = totalMissing === 0;

  return (
    <EmptyState
      title={
        nothingMissingAtAll ? "Every required fact is recorded" : "Nobody matches these filters"
      }
      testId={nothingMissingAtAll ? "missing-empty" : "missing-filter-empty"}
      actions={
        <>
          {nothingMissingAtAll ? (
            scope === "in_season" ? (
              <Button variant="contained" href={outsideHref} sx={{ minHeight: 44 }}>
                See people outside this season
              </Button>
            ) : null
          ) : (
            <Button
              variant="outlined"
              href={
                scope === "in_season"
                  ? "/operate/people/missing"
                  : "/operate/people/missing?scope=outside"
              }
              sx={{ minHeight: 44 }}
            >
              Clear filters
            </Button>
          )}
        </>
      }
    />
  );
}
