import { redirect } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
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
    <Container maxWidth="sm">
      <Box sx={{ py: 10 }}>
        <Stack spacing={3} sx={{ alignItems: "flex-start" }}>
          <Typography variant="h5" component="h1">
            Protected page
          </Typography>
          <Typography color="text.secondary">
            You are signed in as <strong>{data.user.email}</strong>. This page exists only to prove
            that a session gates access, and that it resolves to a club record. It contains no club
            data beyond the operator&rsquo;s own identity.
          </Typography>

          {operator ? (
            <Stack spacing={1.5} sx={{ alignItems: "flex-start" }}>
              <Typography variant="h6" component="h2">
                {operator.displayName}
              </Typography>
              {operator.roleCodes.length > 0 ? (
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
                  {operator.roleCodes.map((code) => (
                    <Chip key={code} label={code} size="small" />
                  ))}
                </Stack>
              ) : (
                <Typography color="text.secondary">
                  This person holds no role that is currently in effect.
                </Typography>
              )}
            </Stack>
          ) : (
            // One state for all three unresolved causes — no link, an inactive
            // link, and (unreachable here, because the session gate above has
            // already redirected) no session. LAN-95 reworded it: LAN-71's
            // "No operator record is linked to this account" was false for a
            // deactivated operator, whose record *is* linked and has simply
            // been disabled, and it sent that person somewhere useless. The
            // replacement is true of all three causes and still discloses which
            // one applies to nobody. Brian chose one neutral state over two
            // specific ones on 2026-08-11; the vocabulary is LAN-90's to
            // settle, and LAN-73 may revisit it when it builds the real state.
            <Alert severity="warning" sx={{ width: "100%" }}>
              This account cannot access the operator area. Contact the committee.
            </Alert>
          )}

          <form action={signOut}>
            <Button type="submit" variant="outlined">
              Sign out
            </Button>
          </form>
        </Stack>
      </Box>
    </Container>
  );
}
