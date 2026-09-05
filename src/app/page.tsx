import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

/**
 * The trivial page that proves the app renders and deploys.
 *
 * Navigation uses MUI's own `href` (a plain anchor) rather than `component={Link}`:
 * this is a Server Component, and passing the `next/link` function into a Client
 * Component boundary is a build error. When real navigation is built, add a small
 * client-side link adapter — do not reach for `component={Link}` here.
 */
export default function Home() {
  return (
    <Container maxWidth="sm">
      <Box sx={{ py: 10 }}>
        <Stack spacing={3}>
          <Typography variant="h4" component="h1">
            Lancers Operations Platform
          </Typography>
          <Typography color="text.secondary">
            Infrastructure scaffold. This deliberately contains no club domain functionality — no
            players, rosters, events, attendance, or communications. Its only job is to prove the
            development, CI, and deployment loop.
          </Typography>
          <Stack direction="row" spacing={2}>
            <Button href="/dashboard" variant="contained">
              Protected page
            </Button>
            <Button href="/login" variant="outlined">
              Sign in
            </Button>
          </Stack>
        </Stack>
      </Box>
    </Container>
  );
}
