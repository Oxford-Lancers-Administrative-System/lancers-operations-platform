import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { isServiceError } from "@/lib/db";
import { UnavailableScreen } from "@/app/operate/unavailable";
import {
  readEventDelivery,
  readEventDeliveryDiagnostics,
  type EventDelivery,
} from "@/lib/services/delivery";
import { gateShellPage } from "../../../gate";
import { DeliveryLayout } from "./delivery-layout";
import { Overview } from "./delivery-overview";
import { Diagnostics } from "./delivery-diagnostics";
import { RepairPanel } from "./delivery-repair-panel";

// Delivery — UX-50, UX-51, UX-52, LAN-78: one route at three depths. Gated
// on `delivery_administration`.
export default async function DeliveryPage({
  params,
  searchParams,
}: PageProps<"/operate/events/[id]/delivery">) {
  const gate = await gateShellPage("/operate/events", "delivery_administration");
  if ("screen" in gate) return gate.screen;

  const { id } = await params;
  const query = await searchParams;
  const view = typeof query.view === "string" ? query.view : "";
  const selected = typeof query.invitation === "string" ? query.invitation : "";
  const search = typeof query.q === "string" ? query.q : "";
  const status = typeof query.status === "string" ? query.status : "";

  let delivery: EventDelivery;
  try {
    delivery = await readEventDelivery(id);
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <UnavailableScreen title="Delivery" message={error.message} testId="delivery-unavailable">
        <Box>
          <Button variant="outlined" href="/operate/events">
            Back to events
          </Button>
        </Box>
      </UnavailableScreen>
    );
  }

  const basePath = `/operate/events/${id}/delivery`;

  const chosen = selected
    ? (delivery.rows.find((row) => row.invitationId === selected) ?? null)
    : null;

  if (chosen) {
    return (
      <DeliveryLayout delivery={delivery} basePath={basePath}>
        <RepairPanel eventId={id} delivery={delivery} row={chosen} />
      </DeliveryLayout>
    );
  }

  if (view === "diagnostics") {
    // A second read: readEventDelivery is scoped to job_type='invitation', this to every attempt (R15).
    const attempts = await readEventDeliveryDiagnostics(id);
    return (
      <DeliveryLayout delivery={delivery} basePath={basePath}>
        <Diagnostics
          delivery={delivery}
          attempts={attempts}
          basePath={basePath}
          search={search}
          status={status}
        />
      </DeliveryLayout>
    );
  }

  return (
    <DeliveryLayout delivery={delivery} basePath={basePath}>
      <Overview delivery={delivery} basePath={basePath} />
    </DeliveryLayout>
  );
}
