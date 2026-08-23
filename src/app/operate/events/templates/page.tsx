import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { isServiceError } from "@/lib/db";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { listEventTemplates, type EventTemplateSummary } from "@/lib/services/event-templates";
import { groupsForEventType } from "@/lib/services/audience-selection";
import { gateShellPage } from "../../gate";
import {
  describeQuestionCount,
  describeTemplateAudience,
  describeTemplateWhere,
  labelFor,
  TEMPLATE_COLUMN_LABELS,
  TEMPLATES_ARE_FIXED,
  TEMPLATES_DETAIL,
  TEMPLATES_HEADLINE,
  TYPE_LABELS,
} from "./presentation";

/**
 * W8-01 — seven types, seven templates.
 *
 * The administration surface D40 asks for, behind the Events area. It is a short
 * list on purpose: there are exactly seven kinds of event, so there are exactly
 * seven templates, and adding an eighth is a change to the approved domain model
 * rather than an administrative act.
 *
 * ## No create and no delete, anywhere
 *
 * There is no **Add a template** control, because there is no such act — the
 * seven rows are created by the migration and `event_templates` is granted
 * `select, update` and nothing else. The sentence under the table says so, which
 * is the one rule this surface states in words: the place somebody would look
 * for that button is the place to say there is not one, or they hunt for it.
 *
 * ## Two presentations of one list
 *
 * A table on a wide screen and cards at 375px, which is how every other list in
 * this application reflows. Nothing is dropped between them — the phone card
 * carries the same four facts, stacked.
 */
export default async function EventTemplatesPage() {
  const gate = await gateShellPage("/operate/events/templates", "event_calendar_management");
  if ("screen" in gate) return gate.screen;

  let templates: EventTemplateSummary[];
  try {
    templates = await listEventTemplates();
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <UnavailableScreen title={TEMPLATES_HEADLINE} message={error.message}>
        <Box>
          <Button variant="outlined" href="/operate/events">
            Back to events
          </Button>
        </Box>
      </UnavailableScreen>
    );
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 900 }} data-testid="event-templates">
      <Box>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {TEMPLATES_HEADLINE}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {TEMPLATES_DETAIL}
        </Typography>
      </Box>

      <Paper variant="outlined" sx={{ p: 0, overflow: "hidden" }}>
        {/* The phone presentation. */}
        <Stack sx={{ display: { xs: "flex", md: "none" } }} data-testid="template-cards">
          {templates.map((template) => (
            <Box
              key={template.eventType}
              sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}
              data-testid="template-card"
            >
              <Button
                href={`/operate/events/templates/${template.eventType}`}
                sx={{ p: 0, minHeight: 44, fontWeight: 700 }}
              >
                {labelFor(TYPE_LABELS, template.eventType)}
              </Button>
              <Typography variant="body2" color="text.secondary">
                {describeTemplateAudience(groupLabels(template))}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {describeTemplateWhere(template.defaultDeliveryMode, template.defaultVenue)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {describeQuestionCount(template.questionCount)}
              </Typography>
            </Box>
          ))}
        </Stack>

        {/* The wide presentation. Scrolls inside itself rather than the page. */}
        <Box sx={{ display: { xs: "none", md: "block" }, overflowX: "auto" }}>
          <Table size="small" data-testid="template-table">
            <TableHead>
              <TableRow>
                <TableCell>{TEMPLATE_COLUMN_LABELS.type}</TableCell>
                <TableCell>{TEMPLATE_COLUMN_LABELS.audience}</TableCell>
                <TableCell>{TEMPLATE_COLUMN_LABELS.where}</TableCell>
                <TableCell>{TEMPLATE_COLUMN_LABELS.questions}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {templates.map((template) => (
                <TableRow key={template.eventType} data-testid="template-row">
                  <TableCell>
                    <Button
                      href={`/operate/events/templates/${template.eventType}`}
                      sx={{ p: 0, minHeight: 44 }}
                    >
                      {labelFor(TYPE_LABELS, template.eventType)}
                    </Button>
                  </TableCell>
                  <TableCell>{describeTemplateAudience(groupLabels(template))}</TableCell>
                  <TableCell>
                    {describeTemplateWhere(template.defaultDeliveryMode, template.defaultVenue)}
                  </TableCell>
                  <TableCell>{describeQuestionCount(template.questionCount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Paper>

      <Typography variant="body2" color="text.secondary" data-testid="templates-are-fixed">
        {TEMPLATES_ARE_FIXED}
      </Typography>

      <Box>
        <Button variant="text" href="/operate/events">
          Back to events
        </Button>
      </Box>
    </Stack>
  );
}

/** The stored group keys as the club's words, in the builder's own order. */
function groupLabels(template: EventTemplateSummary): string[] {
  return groupsForEventType(template.eventType)
    .filter((group) => template.audienceGroups.includes(group.key))
    .map((group) => group.label);
}
