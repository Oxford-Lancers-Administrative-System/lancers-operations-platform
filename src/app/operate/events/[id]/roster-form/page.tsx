import { PageHeader } from "@/components/page-header";
import { Refusal } from "@/components/refusal";
import Stack from "@mui/material/Stack";

import { isServiceError } from "@/lib/db";
import { UnavailableScreen } from "@/app/operate/unavailable";
import {
  readRosterFormData,
  ROSTER_FORM_NOT_APPROVED,
  type Kit,
  type RosterFormData,
} from "@/lib/services/roster-form";
import { gateShellPage } from "../../../gate";
import { RosterFormScreen } from "./roster-form-screen";
import { BACK_LABEL, GENERIC_UNAVAILABLE, HEADING } from "./presentation";

/**
 * `/operate/events/[id]/roster-form` — LAN-267.
 *
 * The action LAN-267 asks for: "A **Roster form** action on a game event's
 * page, for authorised operators."
 *
 * ## The gate
 *
 * `event_calendar_management` — the four offices plus the IT officer, which is
 * what every other deliberate act on a game already requires. It is
 * deliberately not a new capability: the capability map is a recorded
 * authority decision, and `tests/capability-map-single-source.test.ts` makes
 * `capabilities.ts` the only place a role code decides anything. A kit manager
 * who needs to generate a form is a grant Brian widens there, in one row, not
 * something this page decides for itself.
 *
 * The page reads two facts no other operator surface shows — a student number
 * and a BAFA registration number — so it holds the same line the person record
 * does rather than a looser one.
 */
export const dynamic = "force-dynamic";

function kitFrom(value: string | string[] | undefined): Kit {
  return value === "white" ? "white" : "blue";
}

export default async function RosterFormPage({
  params,
  searchParams,
}: PageProps<"/operate/events/[id]/roster-form">) {
  const { id } = await params;
  const query = await searchParams;
  const gate = await gateShellPage(`/operate/events/${id}`, "event_calendar_management");
  if ("screen" in gate) return gate.screen;

  const kit = kitFrom(query.kit);

  let data: RosterFormData;
  try {
    data = await readRosterFormData(id, kit);
  } catch (error) {
    if (isServiceError(error)) {
      return <Refusal title={HEADING} message={error.message} testId="roster-form-refused" />;
    }
    return <UnavailableScreen title={HEADING} message={GENERIC_UNAVAILABLE} />;
  }

  // A draft is not a fixture yet, and handing the officials a form for a game
  // the club has not committed to is worse than having no form: the audience,
  // the date and the venue can all still move.
  if (data.event.status === "draft") {
    return (
      <Stack spacing={3}>
        <PageHeader
          title={HEADING}
          back={{ href: `/operate/events/${id}`, label: BACK_LABEL }}
          subtitle={data.event.name}
        />
        <Refusal
          title={HEADING}
          message={ROSTER_FORM_NOT_APPROVED}
          testId="roster-form-not-approved"
        />
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        title={HEADING}
        back={{ href: `/operate/events/${id}`, label: BACK_LABEL }}
        subtitle={data.event.name}
      />
      <RosterFormScreen
        eventId={id}
        eventName={data.event.name}
        scheduledOn={data.event.scheduledOn}
        players={data.players}
        coaches={data.coaches}
        kit={kit}
      />
    </Stack>
  );
}
