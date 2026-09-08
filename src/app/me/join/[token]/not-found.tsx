import { PublicShell } from "@/components/public-shell";
import { PageHeader } from "@/components/page-header";
import Typography from "@mui/material/Typography";

/**
 * The one response for an unusable sign-up link — LAN-202, following
 * `src/app/a/[token]/not-found.tsx`'s own uniform-invalid contract (Task 09
 * §2.1): unknown, revoked and any other reason a `person_access_tokens`
 * credential no longer resolves all read identically here, and say nothing
 * about the club, the roster, or any other recruit.
 */
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
