import { notFound, redirect } from "next/navigation";

import { isServiceError } from "@/lib/db";
import { redactPersonRecord } from "@/lib/auth/person-authority";
import { readPlayerRecord } from "@/lib/services/player-record";
import type { PersonRecord } from "@/lib/services/person-record";
import { gateShellPage } from "../../gate";
import PlayerRecordView from "./record-view";

// `/operate/roster/[membershipId]` — W6, rebuilt, LAN-187. Gated on
// `person_record_authority` (`REQ-authority`).
export default async function PlayerRecordPage({
  params,
  searchParams,
}: PageProps<"/operate/roster/[membershipId]">) {
  const { membershipId } = await params;
  const query = await searchParams;

  const gate = await gateShellPage(`/operate/roster/${membershipId}`, "person_record_authority");
  if ("screen" in gate) return gate.screen;
  const { operator } = gate;

  let result: Awaited<ReturnType<typeof readPlayerRecord>>;
  try {
    result = await readPlayerRecord(membershipId);
  } catch (error) {
    // A missing membership is a 404; anything else is a fault, not dressed up.
    if (!isServiceError(error)) throw error;
    notFound();
  }

  if (result.kind === "redirect") {
    redirect(result.href);
  }

  const justCreated = query.created === "1";
  // LAN-257: linked/unsaved carried from confirmationHref, read defensively (a hand-typed URL proves nothing).
  const linkedExisting = justCreated && query.linked === "1";
  const unsavedContacts = justCreated ? readUnsavedContacts(query.unsaved) : [];
  const person = redactPersonRecord(
    result.data.person as unknown as Record<string, unknown>,
    operator.roleCodes,
  ) as unknown as Partial<PersonRecord>;

  return (
    <PlayerRecordView
      record={result.data}
      person={person}
      justCreated={justCreated}
      linkedExisting={linkedExisting}
      unsavedContacts={unsavedContacts}
    />
  );
}

function readUnsavedContacts(value: string | string[] | undefined): ("email" | "phone")[] {
  const raw = Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
  return raw
    .split(",")
    .filter((kind): kind is "email" | "phone" => kind === "email" || kind === "phone");
}
