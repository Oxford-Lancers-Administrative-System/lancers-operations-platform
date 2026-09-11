import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { isServiceError } from "@/lib/db";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { IMPORT_PROMPT, IMPORT_PROMPT_VERSION } from "@/lib/services/event-csv";
import { readSeasonImportContext } from "@/lib/services/event-import";
import { gateShellPage } from "../../gate";
import ImportScreen from "./import-screen";

// `/operate/events/import` — bulk import, LAN-155, `W3`.
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
