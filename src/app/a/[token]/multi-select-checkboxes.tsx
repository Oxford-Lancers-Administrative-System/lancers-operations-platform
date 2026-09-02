"use client";

import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

/**
 * The plain, native-checkbox multi-select `interest-questionnaire.tsx` uses
 * for "Which positions interest you?" and "What playing gear do you already
 * have?" — F-206-02, correction round 1. A dedicated client component:
 * `interest-questionnaire.tsx` itself stays a Server Component (it always
 * has), and MUI's `Checkbox` needs a client boundary of its own, the same
 * reason `audience-builder.tsx` — the shipped precedent this idiom is drawn
 * from — is `"use client"` in full rather than only the fragment that needs
 * it. Every box is its own uncontrolled, native form field
 * (`defaultChecked`, no local state): the plain server-action `<form>` this
 * page posts through collects every checked one via `formData.getAll(name)`,
 * with no client-side state to carry several selections at once.
 */
export function MultiSelectCheckboxes({
  name,
  options,
  selected,
}: {
  name: string;
  options: readonly string[];
  selected: ReadonlySet<string>;
}) {
  return (
    <Stack spacing={0.5}>
      {options.map((option) => (
        <FormControlLabel
          key={option}
          sx={{ display: "flex", width: "100%", m: 0 }}
          control={
            <Checkbox
              name={name}
              value={option}
              defaultChecked={selected.has(option)}
              size="small"
            />
          }
          label={option}
        />
      ))}
    </Stack>
  );
}

export function GroupedMultiSelectCheckboxes({
  name,
  groups,
  selected,
}: {
  name: string;
  groups: readonly { readonly label: string; readonly options: readonly string[] }[];
  selected: ReadonlySet<string>;
}) {
  return (
    <Stack spacing={1.5}>
      {groups.map((group) => (
        <Box key={group.label}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: "text.secondary" }}>
            {group.label}
          </Typography>
          <MultiSelectCheckboxes name={name} options={group.options} selected={selected} />
        </Box>
      ))}
    </Stack>
  );
}
