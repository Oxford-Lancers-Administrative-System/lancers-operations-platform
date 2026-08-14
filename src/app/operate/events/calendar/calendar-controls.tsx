"use client";

import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";

/**
 * Moving around the two calendars. LAN-114.
 *
 * ## Why these navigate rather than submit
 *
 * The same defect the event list already paid for: MUI's `TextField select` is
 * a combobox backed by a hidden input, and React writes the chosen value into
 * that input *after* the change handler returns. A handler that submitted the
 * surrounding form would post the previous value, so choosing Hilary would
 * navigate to Michaelmas. The value is therefore taken straight off the change
 * event and the router is pushed with it — see `../event-filters.tsx`, which
 * records how that was found on a real screen rather than in a test.
 *
 * Everything the controls change is a query parameter, so a term card or a
 * month is a link somebody can send, the back button works, and a refresh lands
 * on the same view. The previous and next controls are plain links for the same
 * reason and need no JavaScript at all.
 *
 * ## The month field
 *
 * A native `<input type="month">`, which is the direct navigation a month
 * calendar wants: an operator jumps to March without pressing next five times.
 * It is uncontrolled between renders — `defaultValue` rather than `value` —
 * because the page it navigates to re-renders it with the new month anyway, and
 * a controlled field would fight the picker while the operator is still in it.
 */
export function GregorianControls({
  month,
  previousHref,
  nextHref,
  todayHref,
  basePath,
}: {
  month: string;
  previousHref: string;
  nextHref: string;
  todayHref: string;
  basePath: string;
}) {
  const router = useRouter();

  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={1.5}
      sx={{ alignItems: { sm: "center" }, flexWrap: "wrap", gap: 1.5 }}
      data-testid="gregorian-controls"
    >
      <Stack direction="row" spacing={1}>
        <Button size="small" variant="outlined" href={previousHref} data-testid="month-previous">
          Previous month
        </Button>
        <Button size="small" variant="outlined" href={nextHref} data-testid="month-next">
          Next month
        </Button>
        <Button size="small" variant="text" href={todayHref} data-testid="month-today">
          Today
        </Button>
      </Stack>

      <TextField
        type="month"
        size="small"
        label="Go to month"
        defaultValue={month}
        // A picker fires `change` for each partial value while it is being
        // edited; an empty one means the operator cleared the field rather
        // than chose 1970, so it navigates nowhere.
        onChange={(event) => {
          const value = event.target.value;
          if (/^\d{4}-\d{2}$/.test(value)) {
            router.push(`${basePath}?mode=gregorian&month=${value}`);
          }
        }}
        slotProps={{ inputLabel: { shrink: true } }}
        sx={{ minWidth: 190 }}
        data-testid="month-input"
      />
    </Stack>
  );
}

export interface TermChoice {
  readonly id: string;
  /** "Michaelmas 2026-27" — how the club names the term. */
  readonly label: string;
  /** `term_name` — "michaelmas", "hilary", "trinity". */
  readonly name: string;
  readonly academicYear: string;
}

/**
 * Academic year and term, as two selects rather than one long list.
 *
 * The issue asks for "academic-year and Oxford-term selection", and they are
 * genuinely two questions: a committee planning next year picks the year first
 * and then walks its three terms. Choosing a year moves to the same-named term
 * in that year where it exists — Michaelmas to Michaelmas — and to that year's
 * first term where it does not, so the pair never lands on a combination that
 * is not configured.
 *
 * Both selects are derived from one `terms` prop holding every configured term,
 * because the year select has to know the *other* years' terms in order to jump
 * into one. Deriving both from a single list is also what stops the two
 * controls disagreeing about which combinations exist.
 */
export function OxfordControls({
  terms,
  termId,
  basePath,
}: {
  /** Every configured term, already ordered: newest year first, each year in date order. */
  terms: readonly TermChoice[];
  termId: string;
  basePath: string;
}) {
  const router = useRouter();
  const go = (id: string) => router.push(`${basePath}?mode=oxford&term=${encodeURIComponent(id)}`);

  const selected = terms.find((term) => term.id === termId) ?? terms[0];
  const academicYear = selected?.academicYear ?? "";

  const academicYears: string[] = [];
  for (const term of terms) {
    if (!academicYears.includes(term.academicYear)) academicYears.push(term.academicYear);
  }

  const termsInYear = terms.filter((term) => term.academicYear === academicYear);

  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={1.5}
      sx={{ alignItems: { sm: "center" }, flexWrap: "wrap", gap: 1.5 }}
      data-testid="oxford-controls"
    >
      <TextField
        select
        size="small"
        label="Academic year"
        value={academicYear}
        onChange={(event) => {
          const year = event.target.value;
          const inYear = terms.filter((term) => term.academicYear === year);
          const sameName = inYear.find((term) => term.name === selected?.name);
          const target = sameName ?? inYear[0];
          if (target) go(target.id);
        }}
        sx={{ minWidth: 170 }}
        data-testid="academic-year-select"
      >
        {academicYears.map((year) => (
          <MenuItem key={year} value={year}>
            {year}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        select
        size="small"
        label="Oxford term"
        value={selected?.id ?? ""}
        onChange={(event) => go(event.target.value)}
        sx={{ minWidth: 210 }}
        data-testid="term-select"
      >
        {termsInYear.map((term) => (
          <MenuItem key={term.id} value={term.id}>
            {term.label}
          </MenuItem>
        ))}
      </TextField>
    </Stack>
  );
}
