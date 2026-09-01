import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

/**
 * The one response for an unusable sign-up link — LAN-202, following
 * `src/app/a/[token]/not-found.tsx`'s own uniform-invalid contract (Task 09
 * §2.1): unknown, revoked and any other reason a `person_access_tokens`
 * credential no longer resolves all read identically here, and say nothing
 * about the club, the roster, or any other recruit.
 */
export default function SignupLinkUnusable() {
  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "grey.100", py: { xs: 3, sm: 6 }, px: 2 }}>
      <Box sx={{ maxWidth: 640, mx: "auto" }}>
        <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: 2 }}>
          <Typography component="h1" sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 700 }}>
            This link is no longer live
          </Typography>
          <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1.5 }}>
            Ask the club to send it again.
          </Typography>
        </Paper>
      </Box>
    </Box>
  );
}
