import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import { BrandMark } from "./brand-mark";

/**
 * The frame every page reached without a session shares — LAN-225, brief §2.
 * See `docs/architecture/components.md` and `docs/ux/design-system.md` § 5.
 * `width` is the measure (`narrow`/`medium`/`wide`); `layout` is one card or
 * a stack the page fills itself — `card` for one panel, `stack` for several
 * genuine sections.
 *
 * Decision history: docs/ux/tickets/LAN-231-design-rollout.md
 */
export function PublicShell({
  caption,
  action,
  width = "medium",
  layout,
  children,
  testId,
}: {
  caption?: string;
  action?: ReactNode;
  width?: "narrow" | "medium" | "wide";
  layout?: "card" | "stack";
  children: ReactNode;
  testId?: string;
}) {
  const maxWidth = width === "narrow" ? 520 : width === "medium" ? 720 : 1200;
  const asCard = (layout ?? (width === "wide" ? "stack" : "card")) === "card";
  return (
    <Box
      sx={{ minHeight: "100dvh", bgcolor: "background.default" }}
      data-testid={testId ?? "public-shell"}
    >
      <Box component="header" sx={{ bgcolor: "primary.main", color: "common.white" }}>
        <Stack
          direction="row"
          spacing={2}
          sx={{
            maxWidth: 1200,
            mx: "auto",
            px: { xs: 2, md: 3 },
            py: { xs: 1.5, md: 2 },
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <BrandMark
            tone="onDark"
            size={32}
            crestSize={48}
            caption={caption}
            testId="public-brand"
          />
          {action ? (
            <Box
              sx={{
                "& .MuiButton-root": {
                  color: "common.white",
                  borderColor: "rgba(255,255,255,0.6)",
                },
              }}
            >
              {action}
            </Box>
          ) : null}
        </Stack>
      </Box>
      <Box component="main" sx={{ px: { xs: 2, md: 3 }, py: { xs: 2.5, md: 6 } }}>
        <Box sx={{ maxWidth, mx: "auto" }}>
          {!asCard ? (
            children
          ) : (
            <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 } }}>
              {children}
            </Paper>
          )}
        </Box>
      </Box>
    </Box>
  );
}
