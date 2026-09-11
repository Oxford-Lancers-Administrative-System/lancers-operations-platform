import { redirect } from "next/navigation";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { PublicShell } from "@/components/public-shell";
import { Section } from "@/components/section";
import { ActionBar } from "@/components/action-bar";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { resolveOperator } from "@/lib/auth/operator";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../login/actions";

/**
 * The trivial session-protected page. Re-checks the session server-side —
 * proxy matchers can be changed or bypassed, so every protected route
 * verifies for itself. LAN-71's operator block is the smallest proof a
 * session resolves to a club Person end to end; not a real screen, and
 * enforces nothing (role codes are displayed, not checked — LAN-73).
 *
 * Decision history: docs/operating-the-slice.md
 */
export default async function DashboardPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/login?redirectTo=/dashboard");
  }

  const operator = await resolveOperator();

  return (
    <PublicShell layout="stack">
      <Stack spacing={3} sx={{ alignItems: "flex-start" }}>
        <PageHeader title="Protected page" subtitle={data.user.email} />

        {operator ? (
          <Section title={operator.displayName}>
            {operator.roleCodes.length > 0 ? (
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
                {operator.roleCodes.map((code) => (
                  <Typography key={code} variant="body2">
                    {code}
                  </Typography>
                ))}
              </Stack>
            ) : (
              <Typography color="text.secondary">
                This person holds no role that is currently in effect.
              </Typography>
            )}
          </Section>
        ) : (
          // One state for all unresolved causes (LAN-95): the old wording was false for a deactivated operator. Brian chose neutral over specific, 2026-08-11.
          <Notice severity="warning">
            This account cannot access the operator area. Contact the committee.
          </Notice>
        )}

        <form action={signOut}>
          <ActionBar
            primary={
              <Button type="submit" variant="outlined">
                Sign out
              </Button>
            }
          />
        </form>
      </Stack>
    </PublicShell>
  );
}
