import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";

/**
 * The Events area's two switches — List/Calendar, and inside Calendar,
 * Gregorian/Oxford term. LAN-114.
 *
 * ## Links, not buttons
 *
 * Each choice is a real `<a href>` to the view it selects, following the same
 * reasoning as the list's sortable column headers: a view is a different
 * presentation of the same records, so it belongs in the URL. That makes a
 * chosen view shareable, survivable across a refresh, and reachable with the
 * back button — and it is what "preserve the user's selected view during
 * ordinary navigation where practical" amounts to in a server-rendered
 * application, without a preference to store anywhere.
 *
 * It also means the switch needs no JavaScript and no client component, so it
 * cannot get into a state where the highlighted option and the rendered view
 * disagree: the highlight is computed from the same URL that produced the page.
 *
 * ## Accessibility
 *
 * A labelled `nav` containing links, with `aria-current="page"` on the active
 * one. That is what a screen reader announces as the current view; the filled
 * variant is the sighted equivalent of the same fact, never the only carrier of
 * it.
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
