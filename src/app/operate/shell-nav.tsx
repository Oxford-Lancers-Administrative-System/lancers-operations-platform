"use client";

import {
  useCallback,
  useEffect,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import { ADMINISTRATION_SECTION, type Destination } from "@/app/operate/destinations";
import { BrandMark } from "@/components/brand-mark";
import { CLUB, LAYOUT } from "@/theme-tokens";

/** Sidebar secondary text: Sky Blue on Oxford Blue, 10.67 (theme.ts contrast block). */
const SIDEBAR_MUTED = CLUB.skyBlue;
/** The rule between sidebar groups and above the account block. */
const SIDEBAR_RULE = "rgba(255, 255, 255, 0.18)";

/**
 * The shell's navigation — LAN-195: one element set, laid out two ways by
 * CSS (sticky sidebar from `md` up, hamburger drawer below). Exactly one
 * `<nav aria-label="Operator">`, mounted unconditionally, never duplicated.
 * No `useMediaQuery` — `open` is viewport-independent so server and client
 * always agree. Not an authorization boundary: `destinations` and
 * `administration` are props only (LAN-110's coach shell resolves its own
 * list server-side), carrying display text and hrefs alone. Decision
 * history: relocations.md.
 */
export default function ShellNav({
  operatorName,
  destinations,
  administration = [],
  sectionLabel,
  roleCaption,
  accountAction,
}: {
  operatorName: string;
  destinations: readonly Destination[];
  /** The Administration entries, or empty. Decision history: docs/ux/tickets/LAN-110-coach-attendance.md · missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md · missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md · docs/ux/tickets/LAN-73-shell-and-access.md · missions/intake/M-PEOPLE-AND-ROSTER/decision-history.md. */
  administration?: readonly Destination[];
  /** The word under "Lancers" in the sidebar: "Operations", or "Attendance". */
  sectionLabel: string;
  /** The line under the signed-in name: "Authorized operator", or "Head Coach". */
  roleCaption: string;
  /** The sign-out form. A slot, not an import — this is a client component. Decision history: docs/ux/tickets/LAN-110-coach-attendance.md · missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md · missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md · docs/ux/tickets/LAN-73-shell-and-access.md · missions/intake/M-PEOPLE-AND-ROSTER/decision-history.md. */
  accountAction?: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isCurrent = (destination: Destination): boolean =>
    pathname === destination.href || Boolean(pathname?.startsWith(`${destination.href}/`));

  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeDrawer();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, closeDrawer]);

  const renderDestination = (destination: Destination) => {
    const current = isCurrent(destination);
    return (
      <ListItemButton
        key={destination.href}
        component={Link}
        href={destination.href}
        onClick={closeDrawer}
        selected={current}
        aria-current={current ? "page" : undefined}
        sx={{
          borderRadius: 1,
          justifyContent: "flex-start",
          minHeight: 48,
          color: "inherit",
          "&:hover": { bgcolor: "rgba(255, 255, 255, 0.08)" },
          "&.Mui-selected": { bgcolor: CLUB.skyBlue, color: "primary.main" },
          "&.Mui-selected:hover": { bgcolor: CLUB.skyBlue },
        }}
      >
        <ListItemText
          primary={destination.label}
          secondary={destination.detail}
          slotProps={{
            primary: { sx: { fontWeight: current ? 700 : 500 } },
            secondary: { sx: { color: current ? "primary.main" : SIDEBAR_MUTED } },
          }}
        />
      </ListItemButton>
    );
  };

  return (
    <>
      <Box
        sx={{
          display: { xs: "flex", md: "none" },
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: 56,
          alignItems: "center",
          bgcolor: "primary.main",
          color: "common.white",
          px: 1,
          gap: 0.5,
          zIndex: (theme) => theme.zIndex.appBar,
        }}
      >
        <IconButton aria-label="Open navigation" onClick={openDrawer} sx={{ color: "inherit" }}>
          <MenuGlyph />
        </IconButton>
        <BrandMark tone="onDark" size={24} crestSize={32} testId="phone-brand" />
      </Box>

      {open ? (
        <Box
          data-testid="nav-backdrop"
          aria-hidden="true"
          onClick={closeDrawer}
          sx={{
            display: { xs: "block", md: "none" },
            position: "fixed",
            inset: 0,
            bgcolor: "rgba(0, 0, 0, 0.5)",
            zIndex: (theme) => theme.zIndex.drawer - 1,
          }}
        />
      ) : null}

      <Box
        component="nav"
        aria-label="Operator"
        onKeyDown={(event: ReactKeyboardEvent<HTMLElement>) => {
          if (event.key === "Escape") closeDrawer();
        }}
        sx={[
          {
            bgcolor: "primary.main",
            color: "common.white",
            flexShrink: 0,
            width: { xs: LAYOUT.drawerWidth, md: LAYOUT.sidebarWidth },
            maxWidth: { xs: "85vw", md: "none" },
            position: { xs: "fixed", md: "sticky" },
            top: 0,
            left: 0,
            // height + alignSelf + overflowY are load-bearing together, at both
            // widths. Decision history: docs/ux/tickets/LAN-110-coach-attendance.md · missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md · missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md · docs/ux/tickets/LAN-73-shell-and-access.md · missions/intake/M-PEOPLE-AND-ROSTER/decision-history.md.
            alignSelf: { md: "flex-start" },
            height: "100dvh",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            transition: "transform 0.2s ease",
            transform: open ? "translateX(0)" : "translateX(-100%)",
            visibility: open ? "visible" : "hidden",
          },
          // Array sx entries: MUI's breakpoint-shorthand conflicts with an
          // explicit theme.breakpoints key in the same object (relocations.md).
          (theme) => ({
            zIndex: { xs: theme.zIndex.drawer, md: theme.zIndex.appBar },
            boxShadow: { xs: open ? 8 : "none", md: "none" },
          }),
          (theme) => ({
            [theme.breakpoints.up("md")]: {
              transform: "none",
              visibility: "visible",
            },
          }),
        ]}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            px: 3,
            pt: 3,
            pb: 2,
          }}
        >
          <BrandMark
            tone="onDark"
            size={32}
            crestSize={48}
            caption={sectionLabel}
            testId="sidebar-brand"
          />
          <IconButton
            aria-label="Close navigation"
            onClick={closeDrawer}
            size="small"
            sx={{ display: { xs: "inline-flex", md: "none" }, color: "inherit", mt: 0.5 }}
          >
            <CloseGlyph />
          </IconButton>
        </Box>

        <List sx={{ display: "flex", flexDirection: "column", gap: 0.5, p: 1, width: "100%" }}>
          {destinations.map(renderDestination)}

          {administration.length > 0 ? (
            <Divider aria-hidden sx={{ borderColor: SIDEBAR_RULE, mx: 1, my: 1 }} />
          ) : null}
          {administration.length > 0 ? (
            <Typography
              component="li"
              variant="overline"
              sx={{ color: SIDEBAR_MUTED, px: 2, lineHeight: 1.6 }}
            >
              {ADMINISTRATION_SECTION}
            </Typography>
          ) : null}
          {administration.map(renderDestination)}
        </List>

        <Box sx={{ borderTop: 1, borderColor: SIDEBAR_RULE, mt: "auto", px: 3, py: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {operatorName}
          </Typography>
          <Typography
            variant="caption"
            component="p"
            sx={{ color: SIDEBAR_MUTED }}
            data-testid="shell-role-caption"
          >
            {roleCaption}
          </Typography>
          {accountAction ? <Box sx={{ mt: 1.5 }}>{accountAction}</Box> : null}
        </Box>
      </Box>
    </>
  );
}

/** Inline SVG, matching the house rule against adding `@mui/icons-material` for one glyph — see `admin/page-heading.tsx`. */
function MenuGlyph() {
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      sx={{ width: 24, height: 24, fill: "none", stroke: "currentColor", strokeWidth: 2 }}
    >
      <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
    </Box>
  );
}

function CloseGlyph() {
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      sx={{ width: 20, height: 20, fill: "none", stroke: "currentColor", strokeWidth: 2 }}
    >
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </Box>
  );
}
