import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import type { PersonSummary } from "@/lib/services/person-record";

const MIN_TOUCH_TARGET = 44;

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
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ justifyContent: "space-between", alignItems: "flex-start" }}
      >
        <Box>
          <Typography variant="body2" color="text.secondary">
            <Button
              href={`/operate/people/${personId}`}
              sx={{ p: 0, minHeight: 0, textTransform: "none" }}
            >
              ← {displayName}
            </Button>
          </Typography>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mt: 0.5 }}>
            Merge two records
          </Typography>
        </Box>
        <Button
          href={`/operate/people/${personId}`}
          sx={{ minHeight: MIN_TOUCH_TARGET, textTransform: "none" }}
        >
          Cancel
        </Button>
      </Stack>

      <Box component="form" method="get">
        <Stack direction="row" spacing={1}>
          <TextField
            name="q"
            label="Search name or alias"
            defaultValue={query}
            fullWidth
            autoFocus
          />
          <Button type="submit" variant="contained" sx={{ minHeight: MIN_TOUCH_TARGET }}>
            Search
          </Button>
        </Stack>
      </Box>

      {query.trim() !== "" ? (
        <Paper variant="outlined" sx={{ p: 0 }}>
          {results.length === 0 ? (
            <Typography color="text.secondary" sx={{ p: 3 }}>
              No matches.
            </Typography>
          ) : (
            <Stack>
              {results.map((result) => (
                <Stack
                  key={result.personId}
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  sx={{
                    justifyContent: "space-between",
                    alignItems: { sm: "center" },
                    p: 2,
                    borderBottom: 1,
                    borderColor: "divider",
                    "&:last-child": { borderBottom: 0 },
                  }}
                >
                  <Typography sx={{ fontWeight: 700 }}>{result.displayName}</Typography>
                  <Button
                    variant="contained"
                    href={`/operate/people/${personId}/merge?with=${result.personId}`}
                    sx={{
                      minHeight: MIN_TOUCH_TARGET,
                      alignSelf: { xs: "flex-start", sm: "center" },
                    }}
                  >
                    Compare
                  </Button>
                </Stack>
              ))}
            </Stack>
          )}
        </Paper>
      ) : null}
    </Stack>
  );
}
