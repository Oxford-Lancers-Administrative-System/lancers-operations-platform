import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

export function PolicyHeading({ title, intro }: { title: string; intro: string }) {
  return (
    <Stack spacing={1.5}>
      <Typography component="h1" variant="h4" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      <Typography color="text.secondary">
        Oxford University Lancers American Football Club
      </Typography>
      <Typography>{intro}</Typography>
    </Stack>
  );
}

export function PolicySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box component="section">
      <Typography component="h2" variant="h6" sx={{ mb: 1.5 }}>
        {title}
      </Typography>
      <Stack spacing={1.5}>{children}</Stack>
    </Box>
  );
}

export function PrivacyContact() {
  return (
    <Typography>
      Contact the club’s General Manager for privacy questions, corrections and requests to delete
      your information.
    </Typography>
  );
}
