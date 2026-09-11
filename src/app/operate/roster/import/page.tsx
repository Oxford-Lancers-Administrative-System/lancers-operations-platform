import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { isServiceError } from "@/lib/db";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { readRosterImportContext } from "@/lib/services/roster-import";
import { gateShellPage } from "../../gate";
import ImportScreen from "./import-screen";

// `/operate/roster/import` — CSV bulk import, LAN-215, `WP-arrival-doors`,
// `W1`. Gated on `roster_bulk_import` (four-role), unlike `/operate/roster/new`
// (`W2`, general-operator).
export default async function RosterImportPage() {
  const gate = await gateShellPage("/operate/roster/import", "roster_bulk_import");
  if ("screen" in gate) return gate.screen;

  let context;
  try {
    context = await readRosterImportContext();
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <UnavailableScreen title="Bulk import" message={error.message} testId="import-unavailable">
        <Box>
          <Button variant="outlined" href="/operate/roster">
            Back to the roster
          </Button>
        </Box>
      </UnavailableScreen>
    );
  }

  return (
    <ImportScreen
      seasonLabel={context.seasonLabel}
      onRoster={context.onRoster}
      onboarding={context.onboarding}
      exportHref="/operate/roster/import/export"
    />
  );
}
