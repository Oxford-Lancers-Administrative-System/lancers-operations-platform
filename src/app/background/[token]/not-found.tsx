import { PublicShell } from "@/components/public-shell";
import { PageHeader } from "@/components/page-header";
import Typography from "@mui/material/Typography";

/**
 * The one response for an unusable questionnaire link — LAN-206's uniform
 * terminal contract (E1), unchanged by LAN-343's move to this route. Unknown,
 * revoked, superseded and wrong-purpose all arrive here and read identically.
 */
export default function InterestLinkUnusable() {
  return (
    <PublicShell>
      <PageHeader title={"This link is no longer live"} />
      <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1.5 }}>
        Ask the club to send it again.
      </Typography>
    </PublicShell>
  );
}
