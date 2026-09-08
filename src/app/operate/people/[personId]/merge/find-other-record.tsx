import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { Field } from "@/components/field";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { RowCard, RowCardList } from "@/components/row-card";

import type { PersonSummary } from "@/lib/services/person-record";

/**
 * W4-01 — the same search `W1` uses, reached only from a record the operator
 * already holds. Merged-away records are excluded — `searchPeople()`'s own
 * guarantee.
 */
export default function FindOtherRecord({
  personId,
  displayName,
  query,
  results,
}: {
  personId: string;
  displayName: string;
  query: string;
  results: PersonSummary[];
}) {
  return (
    <Stack spacing={3} sx={{ maxWidth: 880 }}>
      <PageHeader
        title="Merge two records"
        back={{ href: `/operate/people/${personId}`, label: `Back to ${displayName}` }}
        actions={<Button href={`/operate/people/${personId}`}>Cancel</Button>}
      />

      <Box component="form" method="get">
        <Stack direction="row" spacing={1}>
          <Field name="q" label="Search name or alias" defaultValue={query} autoFocus />
          <Button type="submit" variant="contained">
            Search
          </Button>
        </Stack>
      </Box>

      {query.trim() !== "" ? (
        results.length === 0 ? (
          <EmptyState
            title="No matches."
            actions={<Button href={`/operate/people/${personId}/merge`}>Clear search</Button>}
          />
        ) : (
          <RowCardList at="all">
            {results.map((result) => (
              <RowCard
                key={result.personId}
                title={result.displayName}
                actions={
                  <Button
                    variant="contained"
                    href={`/operate/people/${personId}/merge?with=${result.personId}`}
                  >
                    Compare
                  </Button>
                }
              />
            ))}
          </RowCardList>
        )
      ) : null}
    </Stack>
  );
}
