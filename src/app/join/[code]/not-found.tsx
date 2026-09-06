import { PublicShell } from "@/components/public-shell";
import { PageHeader } from "@/components/page-header";
import Typography from "@mui/material/Typography";

/**
 * The one response for an unknown or deactivated sign-up code — LAN-202,
 * following `src/app/a/[token]/not-found.tsx`'s own uniform-invalid contract
 * (Task 09 §2.1): a code that never existed and a code the club deliberately
 * deactivated read identically. This page is public, so it says nothing about
 * the club, the roster, or whether the code ever existed.
 */
export default function SignupCodeUnusable() {
  return (
    <PublicShell>
      <PageHeader title={"This link is no longer live"} />
      <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1.5 }}>
        Ask anybody at the club for the current sign-up link.
      </Typography>
    </PublicShell>
  );
}
