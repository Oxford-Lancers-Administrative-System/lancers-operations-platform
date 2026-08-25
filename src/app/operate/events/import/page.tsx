import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { isServiceError } from "@/lib/db";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { IMPORT_PROMPT, IMPORT_PROMPT_VERSION } from "@/lib/services/event-csv";
import { readSeasonImportContext } from "@/lib/services/event-import";
import { gateShellPage } from "../../gate";
import ImportScreen from "./import-screen";

/**
 * `/operate/events/import` — bulk import, and the export that feeds it.
 * LAN-155, work package `WP-csv-import`, workflow `W3`.
 *
 * A new surface. There is no import, no export and no CSV handling anywhere on
 * `main` before this package, and the one thing this work changes on an existing
 * screen is the Events page's **Create event** control, which becomes a menu of
 * two — `../create-menu.tsx`.
 *
 * ## Three independent refusals, as everywhere under `/operate`
 *
 * The layout guards the frame, `gateShellPage` guards this page, and
 * `readSeasonImportContext()` guards itself in the service layer. `W3` asks for
 * the third by name: "event management capability is required, enforced in the
 * service layer". Reading the calendar is open to any linked, active operator;
 * *changing* it is `event_calendar_management`, and an import is the largest
 * change to it the application offers.
 *
 * ## Why the screen is a client component
 *
 * `REQ-import-confirmation` makes an import a proposal the operator reads before
 * anything is written, so the file, the proposal and the confirmation are three
 * states of one screen rather than three routes. A server-rendered flow would
 * need somewhere to keep the proposal between them, and `W3` says the uploaded
 * file is not retained as a record.
 */
export default async function BulkImportPage() {
  const gate = await gateShellPage("/operate/events", "event_calendar_management");
  if ("screen" in gate) return gate.screen;

  let context;
  try {
    context = await readSeasonImportContext();
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <UnavailableScreen title="Bulk import" message={error.message} testId="import-unavailable">
        <Box>
          <Button variant="outlined" href="/operate/events">
            Back to events
          </Button>
        </Box>
      </UnavailableScreen>
    );
  }

  return (
    <ImportScreen
      seasonLabel={context.season.label}
      total={context.total}
      drafts={context.drafts}
      approved={context.approved}
      cancelled={context.cancelled}
      prompt={IMPORT_PROMPT}
      promptVersion={IMPORT_PROMPT_VERSION}
      exportHref="/operate/events/import/export"
    />
  );
}
