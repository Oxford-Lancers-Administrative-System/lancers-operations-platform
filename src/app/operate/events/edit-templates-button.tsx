import Button from "@mui/material/Button";
import { OPERATOR_EVENT_TEMPLATES_PATH } from "@/app/calendar/routes";

// A stopgap — LAN-165. Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md.
export function EditTemplatesButton() {
  return (
    <Button
      href={OPERATOR_EVENT_TEMPLATES_PATH}
      variant="outlined"
      size="small"
      sx={{ minHeight: 44 }}
      data-testid="edit-templates"
    >
      Edit templates
    </Button>
  );
}
