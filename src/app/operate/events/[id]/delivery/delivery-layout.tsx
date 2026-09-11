import { PageHeader } from "@/components/page-header";
import { OutcomeSlotProvider } from "@/components/outcome-slot";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import type { EventDelivery } from "@/lib/services/delivery";

/** The heading and the standing policy note, on every one of the three. */
export function DeliveryLayout({
  delivery,
  basePath,
  children,
}: {
  delivery: EventDelivery;
  basePath: string;
  children: React.ReactNode;
}) {
  return (
    <OutcomeSlotProvider>
      <Stack spacing={3} sx={{ maxWidth: 1100 }} data-testid="delivery-screen">
        <PageHeader
          title={`Delivery · ${delivery.eventName}`}
          back={{ href: `/operate/events/${delivery.eventId}`, label: "Back to event" }}
          actions={
            <Button href={basePath} variant="outlined">
              Delivery overview
            </Button>
          }
        />
        {children}
      </Stack>
    </OutcomeSlotProvider>
  );
}
