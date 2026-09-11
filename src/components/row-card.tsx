import type { ReactNode } from "react";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

/**
 * The phone half of every table — LAN-225, brief §2. A title, one or two
 * sublines, status chips, one tap target (the whole card when it has `href`).
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
  actionWidth = ACTION_COLUMN,
  testId,
  struckThrough = false,
  emphasized = false,
}: {
  title: ReactNode;
  struckThrough?: boolean;
  /** Highlight a row such as today’s session, without inventing a status. */
  emphasized?: boolean;
  sublines?: ReadonlyArray<ReactNode>;
  /** Status and type chips, in one row under the title. */
  chips?: ReactNode;
  /** The card's one destination. The whole card is the target. */
  href?: string;
  /** A short value at the right of the title row: a count, a date. */
  trailing?: ReactNode;
  /** The row's own controls, at the foot — for a list answered in place (rule 3). Mutually exclusive with `href`. */
  actions?: ReactNode;
  /** Wider inline controls, such as the four-state attendance recorder. */
  actionWidth?: number | string;
  testId?: string;
}) {
  const body = (
    <Stack spacing={0.5} sx={{ p: 2, pb: actions ? { xs: 0, sm: 2 } : 2, minWidth: 0, flex: 1 }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{ justifyContent: "space-between", alignItems: "baseline" }}
      >
        <Typography
          variant="subtitle1"
          component="p"
          sx={{ minWidth: 0, textDecoration: struckThrough ? "line-through" : undefined }}
        >
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
      <Card
        variant="outlined"
        data-testid={testId ?? "row-card"}
        sx={
          emphasized
            ? { borderColor: "primary.main", borderWidth: 2, bgcolor: "action.hover" }
            : undefined
        }
      >
        {/* Beside the content at `sm`+, under it on a phone — stacking at desktop turned a 45-row list into 9,676px in S9's first draft. */}
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
              justifyContent: "flex-end",
              alignSelf: { xs: "stretch", sm: "center" },
              width: { xs: "auto", sm: actionWidth },
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
    <Card
      variant="outlined"
      data-testid={testId ?? "row-card"}
      sx={
        emphasized
          ? { borderColor: "primary.main", borderWidth: 2, bgcolor: "action.hover" }
          : undefined
      }
    >
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

/** Row cards. `at="phone"` (default) shows below `md`, paired with `TableFrame`. `at="all"` is for a list with no desktop table — read as the same card stack at every width. */
export function RowCardList({
  at = "phone",
  component = "div",
  children,
  testId,
}: {
  at?: "phone" | "all";
  component?: "div" | "ul";
  children: ReactNode;
  testId?: string;
}) {
  return (
    <Stack
      component={component}
      spacing={1.5}
      sx={{
        display: at === "all" ? "flex" : { xs: "flex", md: "none" },
        ...(component === "ul" ? { listStyle: "none", p: 0, m: 0 } : {}),
      }}
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
