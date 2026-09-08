import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

/**
 * The one heading every page opens with — LAN-225, brief §2. Replaces about
 * thirty ad hoc headings, `AdminPageHeading` and the record-view headers
 * (audit B2, B5, C1–C3, A5, A8).
 *
 * Title at `display` (`h1`, one per page), one subtitle line, the parent as a
 * back link in one fixed position above the title, and the actions top right,
 * primary first. On a phone the actions drop under the subtitle at full width
 * — a form's own `ActionBar` takes over at the foot when it has one.
 *
 * The back link is always "Back to <place>", sentence case, a text button —
 * never an arrow glyph, never underlined, never at the foot of the page.
 */
export function BackLink({
  href,
  label,
  testId,
}: {
  href: string;
  label: string;
  testId?: string;
}) {
  return (
    <Button
      href={href}
      variant="text"
      size="small"
      sx={{ px: 0.5, mx: -0.5, minHeight: 36, alignSelf: "flex-start" }}
      data-testid={testId ?? "back-link"}
    >
      {label}
    </Button>
  );
}

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  back,
  actions,
  status,
  testId,
}: {
  title: string;
  /** The operating year, a count, a date, or what the page is. Never a sentence of help. */
  subtitle?: ReactNode;
  /** A short overline above the title: the record kind, the section. */
  eyebrow?: string;
  /** The parent, as "Back to <place>". */
  back?: { href: string; label: string };
  /** Top right, primary first. */
  actions?: ReactNode;
  /** A status chip beside the title, for a record whose state is the first fact. */
  status?: ReactNode;
  testId?: string;
}) {
  return (
    <Stack component="header" spacing={1} data-testid={testId ?? "page-header"}>
      {back ? <BackLink href={back.href} label={back.label} /> : null}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ alignItems: { sm: "flex-start" }, justifyContent: "space-between" }}
      >
        <Box sx={{ minWidth: 0 }}>
          {eyebrow ? (
            <Typography variant="overline" component="p" color="text.secondary">
              {eyebrow}
            </Typography>
          ) : null}
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flexWrap: "wrap" }}>
            <Typography variant="h1" component="h1">
              {title}
            </Typography>
            {status ?? null}
          </Stack>
          {subtitle ? (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 0.5 }}
              data-testid="page-subtitle"
            >
              {subtitle}
            </Typography>
          ) : null}
        </Box>
        {actions ? (
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            sx={{ flexShrink: 0, alignItems: { xs: "stretch", sm: "center" } }}
            data-testid="page-actions"
          >
            {actions}
          </Stack>
        ) : null}
      </Stack>
    </Stack>
  );
}
