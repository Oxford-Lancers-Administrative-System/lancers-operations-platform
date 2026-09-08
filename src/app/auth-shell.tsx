import type { ReactNode } from "react";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { PublicShell } from "@/components/public-shell";
import { PageHeader } from "@/components/page-header";

/** Authentication and recovery share the application's public masthead. */
export default function AuthShell({
  heading,
  intro,
  children,
}: {
  heading: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <PublicShell width="narrow" caption="Operations">
      <Stack spacing={3}>
        <PageHeader title={heading} />
        {intro ? (
          <Typography variant="body2" color="text.secondary">
            {intro}
          </Typography>
        ) : null}
        {children}
      </Stack>
    </PublicShell>
  );
}
