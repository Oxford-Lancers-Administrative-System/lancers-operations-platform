"use client";

import { useCallback, useState, type MouseEvent, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { ADMINISTRATION_SECTION, type Destination } from "../operate/destinations";

/**
 * LAN-195 — a mockup of the shell's replacement phone navigation.
 *
 * **This is not `src/app/operate/shell-nav.tsx` and nothing here should be
 * copied into it wholesale.** It exists so the hamburger-and-drawer decision
 * can be driven before anyone touches the real component. See
 * `src/app/nav-preview/README.md` for what is and is not authoritative here.
 *
 * ## The defect this replaces
 *
 * At `xs` the real component lays out all nine destinations as equal-flex
 * items in one 48px-tall row. Nine into a ~375px bar is a ~41.6px slot per
 * label, and "Messaging schedule" does not fit in one, let alone the six of
 * nine labels that are two words. Brian chose a hamburger opening a left
 * drawer over patching the bar (2026-08-30) — see LAN-195.
 *
 * ## How this keeps one element set
 *
 * The real component's own comment is the constraint: "rendering a phone copy
 * and a desktop copy would put every link in the accessibility tree twice."
 * MUI's stock responsive-drawer example does exactly that — a `permanent`
 * `Drawer` and a `temporary` `Drawer`, both always mounted, one hidden by CSS.
 * `display: none` does pull an element out of the accessibility tree, but two
 * mounted copies is still two sets of `Link`s in the DOM, two `id`s if either
 * carried one, and two places a test can assert against by accident.
 *
 * This component instead picks **one branch per render** from a single
 * `useMediaQuery` boolean: the `md` branch is the sticky `Box` the real
 * component already uses, copied verbatim; the `xs` branch is a top bar plus
 * one `Drawer`. `navList` — the destinations, the Administration group, the
 * section header, the signed-in footer — is written once and handed to
 * whichever branch is chosen. At any moment there is exactly one navigation
 * landmark in the DOM, never a hidden second one.
 *
 * The trade this makes against the real component's pure-CSS `sx` responsive
 * props: switching branch is a JS media-query match, not a browser reflow, so
 * server-rendered HTML reflects whatever `useMediaQuery` resolves to before
 * hydration (mobile, absent a match), which can be seen as a one-frame flash
 * at `md` on a slow connection. The real component has no such flash today.
 * Worth weighing against the DOM-duplication risk above; noted in the README.
 *
 * ## What is different from today on purpose
 *
 * The secondary "detail" line (used today only by the coach shell's single
 * destination) was hidden at `xs` because a 48px-tall row has nowhere to put
 * a second line. The drawer has room, so it is shown here at every width —
 * a small, deliberate improvement, not scope creep: it falls out of the
 * redesign rather than being asked for separately.
 */
export default function ProposedShellNav({
  operatorName,
  destinations,
  administration = [],
  sectionLabel,
  roleCaption,
  defaultOpen = false,
}: {
  operatorName: string;
  destinations: readonly Destination[];
  administration?: readonly Destination[];
  sectionLabel: string;
  roleCaption: string;
  /**
   * Mockup-only. Lets `/nav-preview` embed one frame already open and one
   * already closed so both drawer states are visible without Brian having to
   * find the button first — see the README's "let Brian drive" panels.
   */
  defaultOpen?: boolean;
}) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const [open, setOpen] = useState(defaultOpen);

  // Mockup-only concept of "current". The real component reads `usePathname()`
  // against real `/operate/*` hrefs; this route is unauthenticated and those
  // hrefs would bounce an iframe straight to `/login`. So selecting a
  // destination here just marks it and closes the drawer, the way any other
  // menu item does, rather than navigating. Noted in the README as the one
  // place this mockup's mechanism differs from the real component's.
  const [selected, setSelected] = useState<string | null>(destinations[0]?.href ?? null);

  const closeDrawer = useCallback(() => setOpen(false), []);
  const openDrawer = useCallback(() => setOpen(true), []);

  const select = useCallback((event: MouseEvent<HTMLAnchorElement>, href: string) => {
    event.preventDefault();
    setSelected(href);
    setOpen(false);
  }, []);

  const navList = (
    <NavList
      operatorName={operatorName}
      destinations={destinations}
      administration={administration}
      sectionLabel={sectionLabel}
      roleCaption={roleCaption}
      selected={selected}
      onSelect={select}
      onRequestClose={!isDesktop ? closeDrawer : undefined}
    />
  );

  if (isDesktop) {
    // Copied verbatim from `shell-nav.tsx`'s `md` styling — the invariant is
    // that this branch is pixel-identical to what ships today.
    return (
      <Box
        component="nav"
        aria-label="Operator"
        sx={{
          bgcolor: "grey.900",
          color: "common.white",
          flexShrink: 0,
          width: 226,
          position: "sticky",
          top: 0,
          alignSelf: "flex-start",
          height: "100dvh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {navList}
      </Box>
    );
  }

  return (
    <>
      <Box
        component="header"
        sx={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: 56,
          bgcolor: "grey.900",
          color: "common.white",
          display: "flex",
          alignItems: "center",
          px: 1,
          zIndex: (t) => t.zIndex.appBar,
        }}
      >
        <IconButton aria-label="Open navigation" onClick={openDrawer} sx={{ color: "inherit" }}>
          <MenuGlyph />
        </IconButton>
        <Typography variant="subtitle2" sx={{ ml: 0.5, fontWeight: 600 }}>
          {sectionLabel}
        </Typography>
      </Box>

      <Drawer
        anchor="left"
        open={open}
        onClose={closeDrawer}
        slotProps={{
          paper: {
            sx: {
              width: 280,
              maxWidth: "85vw",
              bgcolor: "grey.900",
              color: "common.white",
              display: "flex",
              flexDirection: "column",
            },
          },
        }}
      >
        {navList}
      </Drawer>
    </>
  );
}

function NavList({
  operatorName,
  destinations,
  administration,
  sectionLabel,
  roleCaption,
  selected,
  onSelect,
  onRequestClose,
}: {
  operatorName: string;
  destinations: readonly Destination[];
  administration: readonly Destination[];
  sectionLabel: string;
  roleCaption: string;
  selected: string | null;
  onSelect: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
  /** Present only in the `xs` drawer, where an explicit dismissal is drawn. */
  onRequestClose?: () => void;
}): ReactNode {
  return (
    <>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", px: 3, pt: 3, pb: 2 }}>
        <Box>
          <Typography variant="overline" sx={{ color: "grey.400", lineHeight: 1.4 }}>
            Lancers
          </Typography>
          <Typography component="p" variant="h6" sx={{ fontWeight: 700 }}>
            {sectionLabel}
          </Typography>
        </Box>
        {onRequestClose ? (
          <IconButton aria-label="Close navigation" onClick={onRequestClose} size="small" sx={{ color: "inherit", mt: 0.5 }}>
            <CloseGlyph />
          </IconButton>
        ) : null}
      </Box>

      <List sx={{ display: "flex", flexDirection: "column", gap: 0.5, p: 1, width: "100%" }}>
        {destinations.map((destination) => (
          <NavItem
            key={destination.href}
            destination={destination}
            current={selected === destination.href}
            onSelect={onSelect}
          />
        ))}

        {administration.length > 0 ? (
          <Divider aria-hidden sx={{ borderColor: "grey.800", mx: 1, my: 1 }} />
        ) : null}
        {administration.length > 0 ? (
          <Typography component="li" variant="overline" sx={{ color: "grey.400", px: 2, lineHeight: 1.6 }}>
            {ADMINISTRATION_SECTION}
          </Typography>
        ) : null}
        {administration.map((destination) => (
          <NavItem
            key={destination.href}
            destination={destination}
            current={selected === destination.href}
            onSelect={onSelect}
          />
        ))}
      </List>

      <Box sx={{ borderTop: 1, borderColor: "grey.800", mt: "auto", px: 3, py: 2 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {operatorName}
        </Typography>
        <Typography variant="caption" sx={{ color: "grey.400" }}>
          {roleCaption}
        </Typography>
      </Box>
    </>
  );
}

function NavItem({
  destination,
  current,
  onSelect,
}: {
  destination: Destination;
  current: boolean;
  onSelect: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
}) {
  return (
    <ListItemButton
      component="a"
      href={destination.href}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => onSelect(event, destination.href)}
      selected={current}
      aria-current={current ? "page" : undefined}
      sx={{
        borderRadius: 1,
        color: "inherit",
        minHeight: 48,
        "&.Mui-selected": { bgcolor: "grey.800" },
        "&.Mui-selected:hover": { bgcolor: "grey.800" },
      }}
    >
      <ListItemText
        primary={destination.label}
        secondary={destination.detail}
        slotProps={{
          primary: { sx: { fontWeight: current ? 700 : 500 } },
          secondary: { sx: { color: "grey.400" } },
        }}
      />
    </ListItemButton>
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
