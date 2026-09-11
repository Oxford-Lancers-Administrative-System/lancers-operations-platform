import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";

/**
 * The Events area's two switches — List/Calendar, and Gregorian/Oxford term.
 * LAN-114. Each choice is a real `<a href>`, not a button: a view belongs in
 * the URL, so it's shareable, survives a refresh, and needs no client
 * component — the highlight is computed from the same URL that produced the
 * page. A labelled `nav` with `aria-current="page"` on the active choice.
 */
export interface ViewChoice {
  readonly href: string;
  readonly label: string;
  readonly active: boolean;
  readonly testId?: string;
}

export default function ViewSwitch({
  label,
  choices,
  testId,
}: {
  label: string;
  choices: readonly ViewChoice[];
  testId?: string;
}) {
  return (
    <Stack
      component="nav"
      aria-label={label}
      direction="row"
      spacing={1}
      data-testid={testId}
      sx={{ flexWrap: "wrap", gap: 1 }}
    >
      {choices.map((choice) => (
        <Button
          key={choice.href}
          href={choice.href}
          size="small"
          variant={choice.active ? "contained" : "outlined"}
          aria-current={choice.active ? "page" : undefined}
          data-testid={choice.testId}
        >
          {choice.label}
        </Button>
      ))}
    </Stack>
  );
}
