import { notFound, redirect } from "next/navigation";

import { isServiceError } from "@/lib/db";
import { redactPersonRecord } from "@/lib/auth/person-authority";
import { readPlayerRecord } from "@/lib/services/player-record";
import type { PersonRecord } from "@/lib/services/person-record";
import { gateShellPage } from "../../gate";
import PlayerRecordView from "./record-view";

/**
 * `/operate/roster/[membershipId]` — W6, rebuilt. LAN-187.
 *
 * **Redesigned, not extended.** The person and the season are now visibly
 * different things: durable facts render as the person's and route to the
 * person record; everything else belongs to this one season's membership,
 * banded Person · Onboarding · Season in the board's own three colours
 * (`WP-roster-board`, LAN-186) so the two surfaces read as one product.
 *
 * ## `REQ-authority`, at the whole surface
 *
 * This is the most complete view of one human the application has — date of
 * birth and emergency contact render here and on no list. The gate below
 * therefore names `person_record_authority`, the same four-role capability
 * the board's own page gates on, rather than the wider "any linked operator"
 * floor the shipped LAN-75 page used. A coach, or any operator outside the
 * four offices, is refused **before `readPlayerRecord()` is ever called** —
 * absent from the payload, not merely unrendered.
 *
 * ## Two screens, one route — carried from the shipped page
 *
 * `?created=1` is UX-13's confirmation banner, still this same record rather
 * than a page of its own: the operator's next action is often to show
 * somebody the screen, and a state that vanished on reload could not do that.
 *
 * ## A merged-away person
 *
 * `readPlayerRecord()` resolves a membership whose person was merged away
 * (invariant I6) to wherever the survivor's own record now lives — W1-09 —
 * rather than rendering the stale identity.
 */
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
    // A membership that is not there is a 404, whatever the service called it.
    // Anything that is not a service error is a fault, and belongs in the error
    // boundary as itself rather than dressed up as a missing record.
    if (!isServiceError(error)) throw error;
    notFound();
  }

  if (result.kind === "redirect") {
    redirect(result.href);
  }

  const justCreated = query.created === "1";
  const person = redactPersonRecord(
    result.data.person as unknown as Record<string, unknown>,
    operator.roleCodes,
  ) as unknown as Partial<PersonRecord>;

  return <PlayerRecordView record={result.data} person={person} justCreated={justCreated} />;
}
