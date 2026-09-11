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

/** `/operate/events/[id]/roster-form` — LAN-267. Gated on `event_calendar_management`, recorded in the capability map. */
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

  // A draft is not a fixture yet — handing officials a form before approval is worse than no form.
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
