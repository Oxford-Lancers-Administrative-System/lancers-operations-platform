"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import { DESTINATIONS } from "./destinations";

/**
 * The shell's navigation: Roster, Events, Report — and no Home destination.
 *
 * One element set, laid out two ways by CSS rather than rendered twice: a
 * sidebar from `md` up, a fixed bottom bar below it, which is what UX-02's two
 * wireframes show. Rendering a desktop copy and a phone copy would put every
 * link in the accessibility tree twice and give a screen-reader user two
 * navigations to choose between.
 *
 * A client component only because the current destination has to be highlighted
 * and `usePathname()` is the way to know it. It receives a display name and
 * nothing else — no roles, no ids, no email — because a client component's
 * props are serialized into the page and are readable by anyone who has it.
 *
 * **This is not an authorization boundary and must never become one.** Every
 * destination guards itself server-side; hiding a link would be a courtesy.
 * All three are shown to every operator, per `slice-ux.md` § 3.
 */
export default function ShellNav({ operatorName }: { operatorName: string }) {
  const pathname = usePathname();

  return (
    <Box
      component="nav"
      aria-label="Operator"
      sx={{
        bgcolor: "grey.900",
        color: "common.white",
        flexShrink: 0,
        width: { xs: "100%", md: 226 },
        position: { xs: "fixed", md: "sticky" },
        bottom: { xs: 0, md: "auto" },
        top: { md: 0 },
        left: 0,
        zIndex: (theme) => theme.zIndex.appBar,
        // From `md` up the panel is exactly one viewport tall and sticks to the
        // top of it. All three of these lines are load-bearing:
        //
        //   * `height` — a definite height, not a `maxHeight` ceiling with no
        //     floor. The ceiling alone let the panel collapse to its content,
        //     which put a dark block at the top of a long white column. Brian
        //     found that on a real screen; the render tests could not see it.
        //   * `alignSelf` — the layout's flex parent says `alignItems:
        //     "stretch"`, and a stretched flex item fills its container, which
        //     is taller than the viewport on any page that scrolls. A sticky
        //     element with nowhere to move never sticks, so the item opts out
        //     of stretching and takes its height from the line above.
        //   * `overflowY` — a definite height needs somewhere for the content
        //     to go on a short viewport, or the operator's name is clipped off
        //     the bottom rather than scrolled to.
        //
        // At `xs` none of this applies: the nav is a fixed bottom bar sized by
        // its own content, and the main column clears it with padding.
        alignSelf: { md: "flex-start" },
        height: { md: "100dvh" },
        overflowY: { md: "auto" },
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box sx={{ display: { xs: "none", md: "block" }, px: 3, pt: 3, pb: 2 }}>
        <Typography variant="overline" sx={{ color: "grey.400", lineHeight: 1.4 }}>
          Lancers
        </Typography>
        <Typography component="p" variant="h6" sx={{ fontWeight: 700 }}>
          Operations
        </Typography>
      </Box>

      <List
        sx={{
          display: "flex",
          flexDirection: { xs: "row", md: "column" },
          gap: { xs: 0, md: 0.5 },
          p: { xs: 0, md: 1 },
          width: "100%",
        }}
      >
        {DESTINATIONS.map((destination) => {
          const current =
            pathname === destination.href || pathname?.startsWith(`${destination.href}/`);
          return (
            <ListItemButton
              key={destination.href}
              component={Link}
              href={destination.href}
              selected={Boolean(current)}
              aria-current={current ? "page" : undefined}
              sx={{
                borderRadius: { md: 1 },
                flex: { xs: 1, md: "none" },
                justifyContent: { xs: "center", md: "flex-start" },
                minHeight: 48,
                color: "inherit",
                "&.Mui-selected": { bgcolor: "grey.800" },
                "&.Mui-selected:hover": { bgcolor: "grey.800" },
              }}
            >
              <ListItemText
                primary={destination.label}
                sx={{ flex: "none" }}
                slotProps={{ primary: { sx: { fontWeight: current ? 700 : 500 } } }}
              />
            </ListItemButton>
          );
        })}
      </List>

      <Box
        sx={{
          display: { xs: "none", md: "block" },
          borderTop: 1,
          borderColor: "grey.800",
          mt: "auto",
          px: 3,
          py: 2,
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {operatorName}
        </Typography>
        <Typography variant="caption" sx={{ color: "grey.400" }}>
          Authorized operator
        </Typography>
      </Box>
    </Box>
  );
}
