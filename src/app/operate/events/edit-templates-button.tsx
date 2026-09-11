import Button from "@mui/material/Button";
import { OPERATOR_EVENT_TEMPLATES_PATH } from "@/app/calendar/routes";

/**
 * A stopgap for one problem, and only that one — LAN-165.
 *
 * The mission's final workflow walk over `main` found that
 * `/operate/events/templates` works correctly — per-field inheritance, its
 * save preview, all seven types — and is reachable by nobody who does not
 * already know the address: nothing in the application links to it. Brian,
 * on being shown the screen: put a button here "for the time being."
 *
 * This is deliberately that and nothing more. It is not a considered
 * navigation decision — where template management belongs long-term (its own
 * area? folded into Administration?) is unexamined, and this button should
 * not be read as having settled it. It exists so the seven templates stop
 * being invisible today.
 *
 * Same outlined, small variant as `SubscribeToCalendarButton` immediately to
 * its right, so the row of three reads as one set rather than one control
 * styled apart from the other two — Brian's "white" described that existing
 * outlined button's treatment, not a request for a new style.
 */
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
