import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { gateShellPage } from "../gate";

/**
 * `/operate/report` — the one destination this issue gates on a capability.
 *
 * `slice-ux.md` § 8 restricts the report to an "authorized report operator" and
 * does not say which roles that is. Nobody may decide that in passing, so
 * `leadership_report` is an empty grant and **this page currently refuses every
 * operator, including the President.**
 *
 * That is the intended behaviour of an undecided grant, not an oversight:
 *
 *   * it fails closed, which is the only safe direction for an authorization
 *     boundary;
 *   * it is visible — LAN-81 will meet the refusal on the first run rather than
 *     inheriting a quiet default that let everybody in;
 *   * the page has no content to withhold, so nothing is lost meanwhile.
 *
 * Recorded in the pull request and in `capabilities.ts`. Fixing it is one array
 * in that file, once Brian has said who the authorized report operator is.
 */
export default async function ReportPage() {
  const gate = await gateShellPage("/operate/report", "leadership_report");
  if ("screen" in gate) return gate.screen;

  return (
    <Stack spacing={2} sx={{ maxWidth: 720 }}>
      <Typography variant="h6" component="h1">
        Report
      </Typography>
      <Typography color="text.secondary">
        The Monday exception and action report is not built yet. LAN-81 adds the preview, the
        immutable snapshot and its version history.
      </Typography>
    </Stack>
  );
}
