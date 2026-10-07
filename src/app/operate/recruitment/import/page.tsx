import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { isServiceError } from "@/lib/db";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { ADD_RECRUITS } from "@/lib/auth/roster-access";
import { readRecruitImportContext } from "@/lib/services/recruit-import";
import { gateShellPage } from "../../gate";
import RecruitImportScreen from "./import-screen";

// `/operate/recruitment/import` — bulk-import recruits by CSV, LAN-487. The
// roster import's door (LAN-215) for recruits, behind the hand-add's own
// switch: May add recruits.
export default async function RecruitImportPage() {
  const gate = await gateShellPage("/operate/recruitment/import", ADD_RECRUITS);
  if ("screen" in gate) return gate.screen;

  let context;
  try {
    context = await readRecruitImportContext();
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <UnavailableScreen
        title="Bulk import recruits"
        message={error.message}
        testId="import-unavailable"
      >
        <Box>
          <Button variant="outlined" href="/operate/recruitment">
            Back to recruitment
          </Button>
        </Box>
      </UnavailableScreen>
    );
  }

  return (
    <RecruitImportScreen
      seasonLabel={context.seasonLabel}
      recruits={context.recruits}
      templateHref="/operate/recruitment/import/template"
    />
  );
}
