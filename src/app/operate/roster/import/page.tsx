import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { isServiceError } from "@/lib/db";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { readRosterImportContext } from "@/lib/services/roster-import";
import { gateShellPage } from "../../gate";
import ImportScreen from "./import-screen";

/**
 * `/operate/roster/import` — the CSV bulk import of last season's squad.
 * LAN-215, `WP-arrival-doors`, workflow `W1`.
 *
 * New. There is no roster import anywhere on `main` before this package; the
 * one thing this work changes on an existing screen is the roster board's own
 * **Add player** control, which becomes the **Add players** menu —
 * `../add-players-menu.tsx`, following the shape LAN-155 already gave the
 * Events page.
 *
 * ## Three independent refusals, exactly as `/operate/events/import` has
 *
 * The layout guards the frame, `gateShellPage` guards this page, and
 * `readRosterImportContext()` guards itself again in the service layer —
 * `roster_bulk_import`, four-role, not the shipped general-operator floor
 * `/operate/roster/new` (`W2`) stays at.
 *
 * ## Why the screen is a client component
 *
 * The file, the proposal and the confirmation are three states of one
 * screen: nothing is written until the operator confirms, and the uploaded
 * file is never stored — it lives in the request that produced the proposal
 * and in the confirmation form the operator is looking at, on
 * `/operate/events/import`'s own precedent (`OD7-import-like-events`).
 */
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
