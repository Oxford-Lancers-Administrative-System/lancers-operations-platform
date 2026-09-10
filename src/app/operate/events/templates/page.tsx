import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
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
  NEW_TEMPLATE_ACTION,
  TEMPLATE_COLUMN_LABELS,
  TEMPLATES_DELETE_RULE,
  TEMPLATES_HEADLINE,
} from "./presentation";

/**
 * W8-01 — the club's templates.
 *
 * The administration surface D40 asks for, behind the Events area. It was a
 * fixed list of exactly seven until LAN-265: "A template is anything the
 * operators want to create: 'Kicking Clinic', 'Full Pads Practice', 'Film
 * Review', whatever they name" (Brian, with Stu and Clint, 2026-09-09).
 *
 * ## Create and delete, and the sentence under the table
 *
 * **New template** is here because creating one is now an ordinary
 * administrative act rather than a migration. Deleting is not symmetrical with
 * it, and the sentence under the table is where that is said: a template an
 * event was created from cannot be deleted, because an event's every label is
 * read from its template and there is nothing for one to fall back to. The place
 * an operator looks for **Delete** and does not find it is the place to say why —
 * `docs/ux/standards.md` rule 4, the same reason this surface used to carry the
 * opposite sentence about **Add a type**.
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
        subtitle={templateCount(templates.length)}
        back={{ href: "/operate/events", label: "Back to events" }}
        actions={
          <Button
            variant="contained"
            href="/operate/events/templates/new"
            data-testid="new-template"
            sx={{ minHeight: 44 }}
          >
            {NEW_TEMPLATE_ACTION}
          </Button>
        }
      />

      <RowCardList testId="template-cards">
        {templates.map((template) => (
          <RowCard
            key={template.id}
            testId="template-card"
            title={template.name}
            href={`/operate/events/templates/${template.id}`}
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
                <TableRow key={template.id} data-testid="template-row">
                  <TableCell>
                    <Button
                      href={`/operate/events/templates/${template.id}`}
                      // `textTransform: none` because these are the club's own
                      // words for its own kinds of event — "Strength and
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
                      {template.name}
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

      <Typography variant="body2" color="text.secondary" data-testid="templates-delete-rule">
        {TEMPLATES_DELETE_RULE}
      </Typography>
    </Stack>
  );
}

/** "7 templates" — the count and the noun agreeing. */
function templateCount(count: number): string {
  return `${count} ${count === 1 ? "template" : "templates"}`;
}

/** The stored group keys as the club's words, in the builder's own order. */
function groupLabels(template: EventTemplateSummary): string[] {
  return groupsForEventType(template.eventType)
    .filter((group) => template.audienceGroups.includes(group.key))
    .map((group) => group.label);
}
