import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

/**
 * The one response for an unusable opt-out link — LAN-202, the same
 * uniform-invalid contract every other token page in this application
 * follows (Task 09 §2.1).
 */
export default function StopLinkUnusable() {
  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "grey.100", py: { xs: 3, sm: 6 }, px: 2 }}>
      <Box sx={{ maxWidth: 640, mx: "auto" }}>
        <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: 2 }}>
          <Typography component="h1" sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 700 }}>
            This link is no longer live
          </Typography>
          <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1.5 }}>
            If you still want the club to stop messaging you, ask them directly.
          </Typography>
        </Paper>
      </Box>
    </Box>
  );
}
