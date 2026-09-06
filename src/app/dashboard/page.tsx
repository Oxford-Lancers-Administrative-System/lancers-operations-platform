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
 * The trivial session-protected page. `proxy.ts` already redirects anonymous
 * requests, but this re-checks the session server-side: proxy matchers can be
 * changed or bypassed, so every protected route verifies for itself.
 *
 * LAN-71 added the operator block below. It is deliberately the smallest
 * possible proof that a session resolves to a club Person and their roles end
 * to end — it is not a real screen, and it must not grow into one before the
 * LAN-90 UX approval is recorded. Nothing here enforces anything: the role
 * codes are displayed, not checked. Enforcement arrives in LAN-73.
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
          // One state for all three unresolved causes — no link, an inactive
          // link, and (unreachable here, because the session gate above has
          // already redirected) no session. LAN-95 reworded it: LAN-71's
          // "No operator record is linked to this account" was false for a
          // deactivated operator, whose record *is* linked and has simply
          // been disabled, and it sent that person somewhere useless. The
          // replacement is true of all three causes, and still tells the
          // reader nothing about which of them applies to him. Brian chose
          // the one neutral state over two specific ones on 2026-08-11; the
          // vocabulary is LAN-90's to settle, and LAN-73 may revisit it when
          // it builds the real state.
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
