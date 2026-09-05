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
/** The width the row's own controls get at `sm` and up — `/me/[token]`'s own measure. */
const ACTION_COLUMN = 236;

export function RowCard({
  title,
  sublines = [],
  chips,
  href,
  trailing,
  actions,
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
  /**
   * The row's own controls, at the foot of the card — for a list whose rows
   * are answered in place rather than opened. The player's invitations are
   * that list: `docs/ux/standards.md` rule 3 wants the answer where the
   * question is, not two taps away behind a destination. Mutually exclusive
   * with `href`: a card cannot be one tap target and carry two buttons.
   */
  actions?: ReactNode;
  testId?: string;
}) {
  const body = (
    <Stack spacing={0.5} sx={{ p: 2, pb: actions ? { xs: 0, sm: 2 } : 2, minWidth: 0, flex: 1 }}>
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

  if (actions) {
    return (
      <Card variant="outlined" data-testid={testId ?? "row-card"}>
        {/*
          Beside the content at `sm` and up, under it on a phone. Stacking the
          controls under every row at desktop too is what turned a 45-row list
          into a 9,676px page in the first draft of S9 — three times the
          height of the page it was meant to improve. The measure is the same
          one `/me/[token]` already uses for the same list.
        */}
        <Stack
          direction={{ xs: "column", sm: "row" }}
          sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}
        >
          {body}
          <Stack
            direction="row"
            spacing={1}
            sx={{
              p: 2,
              pt: { xs: 1.5, sm: 2 },
              flexShrink: 0,
              alignSelf: { xs: "stretch", sm: "center" },
              width: { xs: "auto", sm: ACTION_COLUMN },
            }}
            data-testid="row-card-actions"
          >
            {actions}
          </Stack>
        </Stack>
      </Card>
    );
  }

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

/**
 * Row cards. `at="phone"` — the default — shows them below `md` only and pairs
 * with `TableFrame` for the desktop half, which is what every table does.
 *
 * `at="all"` is for a list that has no desktop table to pair with, because it
 * is not a table at either width: the player's own invitations are read on a
 * phone and on a laptop as the same stack of cards, and rendering them as a
 * table on a desktop would invent a surface no wireframe drew.
 */
export function RowCardList({
  at = "phone",
  children,
  testId,
}: {
  at?: "phone" | "all";
  children: ReactNode;
  testId?: string;
}) {
  return (
    <Stack
      spacing={1.5}
      sx={{ display: at === "all" ? "flex" : { xs: "flex", md: "none" } }}
      data-testid={testId}
    >
      {children}
    </Stack>
  );
}

/** Anything that only makes sense at desktop width — the table half. */
export function DesktopOnly({ children }: { children: ReactNode }) {
  return <Box sx={{ display: { xs: "none", md: "block" } }}>{children}</Box>;
}
