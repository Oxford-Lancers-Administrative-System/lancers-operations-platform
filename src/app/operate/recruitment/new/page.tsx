import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { gateShellPage } from "../../gate";

/**
 * `/operate/recruitment/new` — the ADD RECRUIT button's target, wired and
 * landed minimal per LAN-204's own boundary. `LAN-206` (E-4) builds the form,
 * the duplicate resolution and the interest questionnaire; this package's job
 * is only to make sure the board's button goes somewhere real rather than a
 * 404, not to build what is behind it.
 */
export default async function AddRecruitPage() {
  const gate = await gateShellPage("/operate/recruitment/new", "person_record_authority");
  if ("screen" in gate) return gate.screen;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 640 }}>
      <Paper variant="outlined" sx={{ p: 3 }} data-testid="recruitment-add-placeholder">
        <Typography variant="h6" gutterBottom>
          Add a recruit
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Not yet available.
        </Typography>
        <Button variant="outlined" href="/operate/recruitment" sx={{ minHeight: 44 }}>
          Back to recruitment
        </Button>
      </Paper>
    </Box>
  );
}
