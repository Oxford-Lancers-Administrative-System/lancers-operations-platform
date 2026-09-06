import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { PageHeader } from "@/components/page-header";
import { RowCard, RowCardList, DesktopOnly } from "@/components/row-card";
import { TableFrame } from "@/components/sortable-header";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { isServiceError } from "@/lib/db";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { listEventTemplates, type EventTemplateSummary } from "@/lib/services/event-templates";
import { groupsForEventType } from "@/lib/services/audience-selection";
import { OPERATOR_EVENT_TEMPLATES_PATH } from "@/app/calendar/routes";
import { gateShellPage } from "../../gate";
import {
  describeQuestionCount,
  describeTemplateAudience,
  describeTemplateWhere,
  labelFor,
  TEMPLATE_COLUMN_LABELS,
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
  const gate = await gateShellPage(OPERATOR_EVENT_TEMPLATES_PATH, "event_calendar_management");
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
      <PageHeader
        title={TEMPLATES_HEADLINE}
        subtitle={`${templates.length} types`}
        back={{ href: "/operate/events", label: "Back to events" }}
      />

      <RowCardList testId="template-cards">
        {templates.map((template) => (
          <RowCard
            key={template.eventType}
            testId="template-card"
            title={labelFor(TYPE_LABELS, template.eventType)}
            href={`/operate/events/templates/${template.eventType}`}
            sublines={[
              <span key="facts" data-testid="template-card-facts">
                {[
                  `${TEMPLATE_COLUMN_LABELS.audience} ${describeTemplateAudience(groupLabels(template))}`,
                  `${TEMPLATE_COLUMN_LABELS.where} ${describeTemplateWhere(template.defaultDeliveryMode, template.defaultVenue)}`,
                  `${TEMPLATE_COLUMN_LABELS.questions} ${describeQuestionCount(template.questionCount)}`,
                ].join(" · ")}
              </span>,
            ]}
          />
        ))}
      </RowCardList>
      {/* The wide presentation. Scrolls inside itself rather than the page. */}
      <DesktopOnly>
        <TableFrame>
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
                      // `textTransform: none` because these are the club's own
                      // words for its own event types — "Strength and
                      // conditioning", not "STRENGTH AND CONDITIONING" — and
                      // MUI's button default would shout them at an operator
                      // reading a table of sentence-case values. The width and
                      // alignment overrides stop a short label like "Game"
                      // being centred inside the button's minimum width while a
                      // long one starts at the cell edge.
                      sx={{
                        p: 0,
                        minWidth: 0,
                        minHeight: 44,
                        justifyContent: "flex-start",
                        textAlign: "left",
                        textTransform: "none",
                      }}
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
        </TableFrame>
      </DesktopOnly>
    </Stack>
  );
}

/** The stored group keys as the club's words, in the builder's own order. */
function groupLabels(template: EventTemplateSummary): string[] {
  return groupsForEventType(template.eventType)
    .filter((group) => template.audienceGroups.includes(group.key))
    .map((group) => group.label);
}
