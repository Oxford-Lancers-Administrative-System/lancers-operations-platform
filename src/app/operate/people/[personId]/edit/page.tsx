import { notFound } from "next/navigation";
import { isServiceError } from "@/lib/db";
import { readPersonRecord } from "@/lib/services/person-record";
import { personVersion } from "@/lib/services/person-write";
import { readCurrentSeason } from "@/lib/services/seasons";
import { gateShellPage } from "../../../gate";
import EditPersonForm from "./edit-person-form";

// `/operate/people/[personId]/edit` — W2-01..W2-10, LAN-185. Decision history: docs/ux/tickets/LAN-185-person-write.md.
export default async function EditPersonPage({
  params,
}: PageProps<"/operate/people/[personId]/edit">) {
  const { personId } = await params;
  const gate = await gateShellPage(`/operate/people/${personId}/edit`, "person_record_authority");
  if ("screen" in gate) return gate.screen;

  let record;
  try {
    record = await readPersonRecord(personId);
  } catch (error) {
    if (isServiceError(error) && error.kind === "not_found") notFound();
    throw error;
  }

  const version = await personVersion(personId);
  // B3, round 2: the inline WhatsApp-seam preview needs the active season's label.
  const season = await readCurrentSeason().catch(() => null);

  return (
    <EditPersonForm
      personId={personId}
      record={record}
      expectedVersion={version}
      seasonLabel={season?.label ?? "the active season"}
    />
  );
}
