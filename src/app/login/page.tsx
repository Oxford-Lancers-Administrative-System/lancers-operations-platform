import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import LoginForm from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const raw = params.redirectTo;
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  const redirectTo =
    candidate && candidate.startsWith("/") && !candidate.startsWith("//")
      ? candidate
      : "/dashboard";

  return (
    <Container maxWidth="xs">
      <Box sx={{ py: 10 }}>
        <Stack spacing={3}>
          <Typography variant="h5" component="h1">
            Sign in
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Accounts are provisioned by an administrator. There is no public sign-up.
          </Typography>
          <LoginForm redirectTo={redirectTo} />
        </Stack>
      </Box>
    </Container>
  );
}
