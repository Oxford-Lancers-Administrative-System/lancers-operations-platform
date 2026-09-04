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
import { ADMINISTRATION_SECTION, type Destination } from "./destinations";
import { BrandMark } from "@/components/brand-mark";
import { CLUB, LAYOUT } from "@/theme-tokens";

/** Sidebar secondary text: Sky Blue on Oxford Blue, 10.67 (theme.ts contrast block). */
const SIDEBAR_MUTED = CLUB.skyBlue;
/** The rule between sidebar groups and above the account block. */
const SIDEBAR_RULE = "rgba(255, 255, 255, 0.18)";

/**
 * The shell's navigation — LAN-195. One element set, laid out two ways by CSS
 * rather than rendered twice: a sticky sidebar from `md` up, a hamburger-opened
 * left drawer below it. Replaces the fixed bottom bar LAN-195 retired, which at
 * 375px carried nine equal-flex destinations in illegible ~41.6px slots — see
 * `docs/ux/slice-ux.md` § 7's LAN-195 amendment and the approved mockup on
 * `chore/nav-drawer-mockup`.
 *
 * ## Exactly one navigation landmark, always — never a hidden second one
 *
 * There is one `<nav aria-label="Operator">` in this file and it is mounted
 * unconditionally. MUI's own stock responsive-drawer example mounts a
 * `permanent` `Drawer` and a `temporary` `Drawer` side by side, one hidden by
 * CSS: `display: none` does pull an element out of the accessibility tree, but
 * while both are mounted there are still two sets of `Link`s in the DOM and two
 * places a test — or a screen reader landmark list — can find navigation. This
 * component never builds that second copy. `open` only ever toggles whether
 * the one nav is *reachable*; it never causes a second one to exist.
 *
 * ## No hydration flash — solved without `useMediaQuery`
 *
 * The approved mockup branched on a `useMediaQuery` read to choose between the
 * sidebar and the drawer, and its own README named the cost: server-rendered
 * HTML reflects whatever the media query resolves to before hydration —
 * mobile, absent a match — which can read as a one-frame flash at desktop
 * width. This component makes no such read. `open` is a plain `useState(false)`
 * with no viewport dependency at all, so the server and the freshly-hydrated
 * client always agree on it, and the desktop/phone *geometry* (`position`,
 * `width`, `top`) is decided entirely by the same CSS breakpoints the sticky
 * sidebar already used — a browser paints the final, correct layout on first
 * paint, the same way it already does today. Nothing here waits on JavaScript
 * to decide which layout to show.
 *
 * The one piece of `open`-driven state that *is* visible in the exported
 * styles — `visibility` and `transform`, both set unconditionally below and
 * then forced back to their desktop values inside an explicit
 * `theme.breakpoints.up("md")` block — is deliberately written this way rather
 * than as an ordinary `{ xs, md }` breakpoint object. An ordinary breakpoint
 * object wraps *every* key, `xs` included, in its own `@media` query, and a
 * property that only exists inside a media query cannot be asserted by a
 * closed-drawer regression test without also faking a real browser viewport.
 * Writing the mobile-default value unconditionally, with the desktop value as
 * an explicit override, keeps exactly the same real-browser result (the `md`
 * override wins at desktop width, by ordinary CSS cascade) while leaving the
 * unconditional declaration directly assertable.
 *
 * ## What changed from the retired bottom bar, and why
 *
 * Brian's four approved choices from the mockup (2026-08-30): the top bar
 * carries only the hamburger, three dismiss paths (an explicit close control,
 * backdrop tap or Escape, and selecting any destination), a 280px drawer
 * (wider than the 226px desktop sidebar — real labels like "Messaging
 * schedule" were cramped at 226), and the secondary detail line now rendering
 * at phone width too, which was hidden before only because the 48px bottom-bar
 * row had nowhere to put it. All four are structure and copy the mockup
 * settled; this component builds them against the application's own MUI/`sx`
 * conventions rather than the mockup's own styling.
 *
 * A client component only because the current destination has to be
 * highlighted and the drawer's open/closed state has to live somewhere. It
 * receives a display name and nothing else — no roles, no ids, no email —
 * because a client component's props are serialized into the page and are
 * readable by anyone who has it.
 *
 * **This is not an authorization boundary and must never become one.** Every
 * destination guards itself server-side; hiding a link would be a courtesy.
 * All three are shown to every operator, per `slice-ux.md` § 3.
 *
 * The one exception § 3 itself writes is the coaching assignment, which
 * "receives only the occurred-event attendance surface". That is why the
 * destinations arrive as a prop rather than being imported here: LAN-110's
 * coach shell is a different *list*, resolved on the server from the verified
 * session, and a client component must not be the thing that decides it. The
 * section and role captions travel the same way and for the same reason.
 *
 * What arrives is still display text and hrefs alone — no role codes, no
 * capability map, no ids — because a client component's props are serialized
 * into the page and readable by anyone holding it.
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
  /**
   * LAN-133. The Administration entries, or empty for an operator who holds no
   * administration authority. They render as a separated group at the bottom of
   * the sidebar, immediately above the signed-in account, which is what
   * `DEC-administration-navigation` decides and what the reviewed prototype
   * draws. Empty is the ordinary case and renders nothing at all — not an empty
   * heading.
   */
  administration?: readonly Destination[];
  /** The word under "Lancers" in the sidebar: "Operations", or "Attendance". */
  sectionLabel: string;
  /** The line under the signed-in name: "Authorized operator", or "Head Coach". */
  roleCaption: string;
  /**
   * LAN-225 (audit B3): the sign-out form, rendered in the account block so a
   * phone never spends 180px of its first screen on the account before the
   * page title. A slot rather than an import, because the action is a server
   * function and this is a client component.
   */
  accountAction?: ReactNode;
}) {
  const pathname = usePathname();
  // Deliberately viewport-independent — see the doc comment above. Closed on
  // first render everywhere, server and client alike, so there is nothing for
  // hydration to disagree about.
  const [open, setOpen] = useState(false);

  const isCurrent = (destination: Destination): boolean =>
    pathname === destination.href || Boolean(pathname?.startsWith(`${destination.href}/`));

  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);

  // Escape closes the drawer. Only listens while it is open, so hydration adds
  // no document-level listener that a closed, desktop shell never needs.
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
          // LAN-225 (audit B1): the active item is a Sky Blue tint with Oxford
          // Blue text (10.67), never Royal Blue on Oxford Blue (1.82).
          "&:hover": { bgcolor: "rgba(255, 255, 255, 0.08)" },
          "&.Mui-selected": { bgcolor: CLUB.skyBlue, color: "primary.main" },
          "&.Mui-selected:hover": { bgcolor: CLUB.skyBlue },
        }}
      >
        <ListItemText
          primary={destination.label}
          // LAN-195, approved choice 4: the secondary line now renders at every
          // width. It was hidden at `xs` only because the retired bottom bar's
          // 48px row had nowhere to put it; the drawer has room, so a coach's
          // shell now shows "This season's sessions" on a phone too. A known,
          // accepted side effect — not suppressed and not a defect.
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
      {/*
        The phone top bar — approved choice 1: only the hamburger, no
        wordmark, no section label. Hidden at `md`, where the sticky sidebar
        already carries this chrome permanently. A plain `Box`, not a
        semantic `<header>`, so this never introduces a second landmark
        (a `banner`) alongside the one this file is careful to keep singular.
      */}
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
        {/*
          LAN-225, delta S0-d. LAN-195's choice 1 kept this bar to the hamburger
          because the main content's own heading said "Lancers Operations"
          beneath it. Audit B2 removes that heading, so the crest and the name
          move here. Brian may revert to the bare hamburger at visual review.
        */}
        <BrandMark tone="onDark" size={24} testId="phone-brand" />
      </Box>

      {/*
        The backdrop — the second of the three approved dismiss paths. Mounted
        only while open, so it carries no closed-state visibility logic to get
        wrong and adds nothing for a desktop shell, which never opens it.
      */}
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
            // From `md` up the panel is exactly one viewport tall and sticks to
            // the top of it. All three of these lines are load-bearing:
            //
            //   * `height` — a definite height, not a `maxHeight` ceiling with
            //     no floor. The ceiling alone let the panel collapse to its
            //     content, which put a dark block at the top of a long white
            //     column. Brian found that on a real screen; the render tests
            //     could not see it.
            //   * `alignSelf` — the layout's flex parent says `alignItems:
            //     "stretch"`, and a stretched flex item fills its container,
            //     which is taller than the viewport on any page that scrolls.
            //     A sticky element with nowhere to move never sticks, so the
            //     item opts out of stretching and takes its height from the
            //     line above.
            //   * `overflowY` — a definite height needs somewhere for the
            //     content to go on a short viewport, or the operator's name is
            //     clipped off the bottom rather than scrolled to.
            //
            // The drawer at `xs` needs the same full-height, scrollable panel
            // for the same reason — a long Administration list on a short
            // phone.
            alignSelf: { md: "flex-start" },
            height: "100dvh",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            transition: "transform 0.2s ease",
            // Deliberately unconditional — see the file's doc comment. This is
            // the mobile-default value; the two `theme.breakpoints.up("md")`
            // overrides below are what keep the desktop sidebar exactly as it
            // always rendered, regardless of `open`.
            transform: open ? "translateX(0)" : "translateX(-100%)",
            visibility: open ? "visible" : "hidden",
          },
          // `zIndex` and `boxShadow` need `theme` (for the design tokens and
          // the numeric shadow scale) and so cannot live in the plain object
          // above — but they still have to stay out of the *next* function
          // below, in their own array entry. MUI's breakpoint-shorthand
          // expansion (the `{ xs, md }` object form) does not coexist inside
          // one sx object with an explicit `theme.breakpoints.up(...)` key:
          // verified directly against this exact combination, where adding
          // the override key silently dropped every other property's `md`
          // value from the compiled CSS. Splitting the `sx` prop into an
          // array — which MUI merges in order — sidesteps the interaction
          // entirely.
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
          {/* LAN-225 (audit B1): the crest, the club's name, the section caption. */}
          <BrandMark tone="onDark" size={32} caption={sectionLabel} testId="sidebar-brand" />
          {/*
            The first of the three approved dismiss paths. Hidden at `md`,
            where there is nothing to dismiss.
          */}
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
