import { PublicShell } from "@/components/public-shell";
import { PageHeader } from "@/components/page-header";
import Typography from "@mui/material/Typography";

/** Uniform response for an unknown or deactivated sign-up code (LAN-202, Task 09 §2.1) — says nothing about whether the code ever existed. */
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
