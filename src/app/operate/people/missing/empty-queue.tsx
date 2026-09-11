import Button from "@mui/material/Button";
import { EmptyState } from "@/components/empty-state";
import type { PeopleScope } from "@/lib/services/people-directory";

// Two distinguishable outcomes — `W7-04`/`W7-05` — neither is a failure.
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
