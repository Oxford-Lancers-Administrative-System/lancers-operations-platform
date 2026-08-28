import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { resolveOperator } from "@/lib/auth/operator";

import { openMyPage } from "./actions";
import { OPEN_MY_PAGE, PAGE_HEADING, PAGE_HELP } from "./presentation";

export const dynamic = "force-dynamic";

/**
 * F-A3. The signed-in entry point `/me/[token]` never had.
 *
 * `/me/[token]` is reachable only from the redirect after a WhatsApp/email
 * answer link's own POST (`src/app/a/[token]/actions.ts`). A club member with
 * a login and no answer history of their own — a committee member or coach
 * who is also, separately, an invitee — had no way to reach their own page at
 * all. This is that route: session-gated, resolves to the signed-in person's
 * own identity, and hands off to `openMyPage` to mint the credential and
 * redirect, rather than doing either on this render — see that action's own
 * comment for why the write waits for the click.
 *
 * No wireframe drew this screen; none existed to draw, because F-A3's own
 * finding is that no route to it existed either. Owner decision Q-32 (Brian,
 * 2026-08-27) put the finding in scope for this correction without
 * prescribing its shape, so this is deliberately the smallest page that
 * satisfies the acceptance: one sentence naming what the button does, one
 * button, no invented navigation this ticket was not asked to place it in.
 */
export default async function MyPageEntry() {
  const operator = await resolveOperator();
  if (!operator) {
    redirect("/login?redirectTo=%2Fme");
  }

  return (
    <Container maxWidth="sm">
      <Box sx={{ py: { xs: 6, sm: 10 } }}>
        <Stack spacing={3} sx={{ alignItems: "flex-start" }}>
          <Typography variant="h5" component="h1">
            {PAGE_HEADING}
          </Typography>
          <Typography color="text.secondary">{PAGE_HELP}</Typography>
          <form action={openMyPage}>
            <Button type="submit" variant="contained" sx={{ minHeight: 44 }}>
              {OPEN_MY_PAGE}
            </Button>
          </form>
        </Stack>
      </Box>
    </Container>
  );
}
