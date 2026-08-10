import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../login/actions";

/**
 * The trivial session-protected page. `proxy.ts` already redirects anonymous
 * requests, but this re-checks the session server-side: proxy matchers can be
 * changed or bypassed, so every protected route verifies for itself.
 */
export default async function DashboardPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/login?redirectTo=/dashboard");
  }

  return (
    <Container maxWidth="sm">
      <Box sx={{ py: 10 }}>
        <Stack spacing={3} sx={{ alignItems: "flex-start" }}>
          <Typography variant="h5" component="h1">
            Protected page
          </Typography>
          <Typography color="text.secondary">
            You are signed in as <strong>{data.user.email}</strong>. This page exists only to prove
            that a session gates access. It contains no club data.
          </Typography>
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
