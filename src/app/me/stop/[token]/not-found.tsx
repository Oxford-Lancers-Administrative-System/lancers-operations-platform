import { PublicShell } from "@/components/public-shell";
import { PageHeader } from "@/components/page-header";
import Typography from "@mui/material/Typography";

/**
 * The one response for an unusable opt-out link — LAN-202, the same
 * uniform-invalid contract every other token page in this application
 * follows (Task 09 §2.1).
 */
export default function StopLinkUnusable() {
  return (
    <PublicShell>
      <PageHeader title={"This link is no longer live"} />
      <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1.5 }}>
        If you still want the club to stop messaging you, ask them directly.
      </Typography>
    </PublicShell>
  );
}
