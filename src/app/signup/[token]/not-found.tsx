import { PublicShell } from "@/components/public-shell";
import { PageHeader } from "@/components/page-header";
import Typography from "@mui/material/Typography";

/** Uniform response for an unusable sign-up link (LAN-202, Task 09 §2.1) — says nothing about the club, roster, or any other recruit. */
export default function SignupLinkUnusable() {
  return (
    <PublicShell>
      <PageHeader title={"This link is no longer live"} />
      <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1.5 }}>
        Ask the club to send it again.
      </Typography>
    </PublicShell>
  );
}
