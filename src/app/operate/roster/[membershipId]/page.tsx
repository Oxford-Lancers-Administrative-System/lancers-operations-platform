import { notFound, redirect } from "next/navigation";

import { isServiceError } from "@/lib/db";
import { redactPersonRecord } from "@/lib/auth/person-authority";
import { readOperatorPreferences } from "@/lib/services/operator-preferences";
import { readPlayerRecord } from "@/lib/services/player-record";
import type { PersonRecord } from "@/lib/services/person-record";
import { gateShellPage } from "../../gate";
import PlayerRecordView from "./record-view";
import { PERSON_RECORD_BRIDGE } from "@/lib/auth/grants";

// `/operate/roster/[membershipId]` — W6, rebuilt, LAN-187. Gated on
// `person_record_authority` (`REQ-authority`).
export default async function PlayerRecordPage({
  params,
  searchParams,
}: PageProps<"/operate/roster/[membershipId]">) {
  const { membershipId } = await params;
  const query = await searchParams;

  // LAN-429 bridge: replaced by LAN-432
  const gate = await gateShellPage(`/operate/roster/${membershipId}`, PERSON_RECORD_BRIDGE);
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
    operator.grants,
  ) as unknown as Partial<PersonRecord>;

  // LAN-387, Brian's visual pass item 1: the record's groups are the board's
  // groups, so they read the one setting the operator's account holds.
  const preferences = await readOperatorPreferences(operator.personId);

  return (
    <PlayerRecordView
      record={result.data}
      person={person}
      justCreated={justCreated}
      linkedExisting={linkedExisting}
      unsavedContacts={unsavedContacts}
      initialCollapsedGroups={preferences.rosterCollapsedGroups}
    />
  );
}

function readUnsavedContacts(value: string | string[] | undefined): ("email" | "phone")[] {
  const raw = Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
  return raw
    .split(",")
    .filter((kind): kind is "email" | "phone" => kind === "email" || kind === "phone");
}
