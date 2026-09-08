import type { ReactNode } from "react";
import Divider from "@mui/material/Divider";
import Alert from "@mui/material/Alert";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import { PublicShell } from "@/components/public-shell";

export default function PolicyLayout({ children }: { children: ReactNode }) {
  return (
    <PublicShell caption="Club information" width="medium">
      <Stack spacing={4} sx={{ overflowWrap: "anywhere" }}>
        <Alert severity="info">Draft for club review. These documents are not yet in effect.</Alert>
        {children}
        <Divider />
        <Stack
          component="nav"
          aria-label="Club policies"
          direction="row"
          useFlexGap
          spacing={2}
          sx={{ flexWrap: "wrap" }}
        >
          <Link href="/privacy">Privacy notice</Link>
          <Link href="/data-deletion">Data deletion</Link>
          <Link href="/terms">Terms of use</Link>
        </Stack>
      </Stack>
    </PublicShell>
  );
}
