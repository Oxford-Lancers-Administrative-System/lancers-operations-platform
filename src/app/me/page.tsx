import { redirect } from "next/navigation";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import OperatorShell from "../operate/operator-shell";
import { PageHeader } from "@/components/page-header";
import { ActionBar } from "@/components/action-bar";

import { resolveOperator } from "@/lib/auth/operator";

import { openMyPage } from "./actions";
import { OPEN_MY_PAGE, PAGE_HEADING, PAGE_HELP } from "./presentation";

export const dynamic = "force-dynamic";

/**
 * F-A3. The signed-in entry point `/events/[token]` never had. Session-gated,
 * resolves to the signed-in person's identity, hands off to `openMyPage` to
 * mint the credential and redirect on click, not on render. No wireframe:
 * Q-32 (Brian, 2026-08-27) put the finding in scope without prescribing a
 * shape, so this is the smallest page that satisfies the acceptance.
 */
export default async function MyPageEntry() {
  const operator = await resolveOperator();
  if (!operator) {
    redirect("/login?redirectTo=%2Fme");
  }

  return (
    <OperatorShell operator={operator}>
      <Stack spacing={3} sx={{ alignItems: "flex-start" }}>
        <PageHeader title={PAGE_HEADING} />
        <Typography color="text.secondary">{PAGE_HELP}</Typography>
        <form action={openMyPage}>
          <ActionBar
            primary={
              <Button type="submit" variant="contained">
                {OPEN_MY_PAGE}
              </Button>
            }
          />
        </form>
      </Stack>
    </OperatorShell>
  );
}
