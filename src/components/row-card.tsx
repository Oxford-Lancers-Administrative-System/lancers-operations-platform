import type { ReactNode } from "react";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

/**
 * The phone half of every table — LAN-225, brief §2. Replaces the seven
 * phone card renderers (audit E4, F4, F7, G4): a title, one or two sublines,
 * the status chips, and one tap target, which is the whole card when it has
 * an `href`. A value that used to hide behind an icon button — a phone
 * number — is text on the card, and a missing one says so in words.
 */
export function RowCard({
  title,
  sublines = [],
  chips,
  href,
  trailing,
  testId,
}: {
  title: string;
  sublines?: ReadonlyArray<ReactNode>;
  /** Status and type chips, in one row under the title. */
  chips?: ReactNode;
  /** The card's one destination. The whole card is the target. */
  href?: string;
  /** A short value at the right of the title row: a count, a date. */
  trailing?: ReactNode;
  testId?: string;
}) {
  const body = (
    <Stack spacing={0.5} sx={{ p: 2 }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{ justifyContent: "space-between", alignItems: "baseline" }}
      >
        <Typography variant="subtitle1" component="p" sx={{ minWidth: 0 }}>
          {title}
        </Typography>
        {trailing ? (
          <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
            {trailing}
          </Typography>
        ) : null}
      </Stack>
      {chips ? (
        <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", gap: 0.75 }}>
          {chips}
        </Stack>
      ) : null}
      {sublines.map((line, index) => (
        <Typography key={index} variant="body2" color="text.secondary" component="div">
          {line}
        </Typography>
      ))}
    </Stack>
  );

  return (
    <Card variant="outlined" data-testid={testId ?? "row-card"}>
      {href ? (
        <CardActionArea href={href} sx={{ display: "block", textAlign: "left" }}>
          {body}
        </CardActionArea>
      ) : (
        body
      )}
    </Card>
  );
}

/** Row cards, shown below `md` only; pair with `TableFrame` for the desktop half. */
export function RowCardList({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <Stack spacing={1.5} sx={{ display: { xs: "flex", md: "none" } }} data-testid={testId}>
      {children}
    </Stack>
  );
}

/** Anything that only makes sense at desktop width — the table half. */
export function DesktopOnly({ children }: { children: ReactNode }) {
  return <Box sx={{ display: { xs: "none", md: "block" } }}>{children}</Box>;
}
