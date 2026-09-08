import { isServiceError } from "@/lib/db";
import { listTermWindows } from "@/lib/services/seasons";
import { readEventFormDefaults } from "@/lib/services/event-templates";
import { Refusal } from "@/components/refusal";
import { gateShellPage } from "@/app/operate/gate";
import EventFormPreview from "./event-form-preview";

/**
 * S4 — Create event, on the kit. LAN-225.
 *
 * `/operate/events/new`, read through the same gate and the same two services
 * (the Oxford calendar and the seven type templates). The form is drawn from
 * `Field`, `SelectField`, `DateField`, `TimeField`, `ChoiceField` and an
 * `ActionBar`; the two info alerts that were page furniture become the
 * subtitle and a helper line (E2), with their words unchanged. Nothing posts.
 */
export default async function EventNewPreviewPage() {
  const gate = await gateShellPage("/design-preview/event-new", "event_calendar_management");
  if ("screen" in gate) return gate.screen;

  let terms;
  let templates;
  try {
    [terms, templates] = await Promise.all([listTermWindows(), readEventFormDefaults()]);
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <Refusal
        title="Create event"
        message={error.message}
        action={{ href: "/operate/events", label: "Back to events" }}
      />
    );
  }

  return <EventFormPreview terms={terms} templates={templates} />;
}
