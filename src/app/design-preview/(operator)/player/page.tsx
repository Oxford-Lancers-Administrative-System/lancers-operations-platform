import { isServiceError } from "@/lib/db";
import { redactPersonRecord } from "@/lib/auth/person-authority";
import { readPlayerRecord } from "@/lib/services/player-record";
import type { PersonRecord } from "@/lib/services/person-record";
import { Refusal } from "@/components/refusal";
import { gateShellPage } from "@/app/operate/gate";
import { pickPlayerMembershipId } from "../../picks";
import PlayerRecordPreview from "./player-record-preview";

/**
 * S2 — the player record, on the kit. LAN-225.
 *
 * `/operate/roster/[membershipId]` for one seeded active player, read through
 * the same gate and the same service, redacted for the reader's role exactly
 * as the real page redacts it. Content unchanged; in-place editing is drawn as
 * values, not wired.
 */
export default async function PlayerPreviewPage() {
  const gate = await gateShellPage("/design-preview/player", "person_record_authority");
  if ("screen" in gate) return gate.screen;

  const membershipId = await pickPlayerMembershipId();
  if (!membershipId) {
    return (
      <Refusal
        title="No player to show"
        message="The seed has no membership on the current roster."
        action={{ href: "/design-preview/roster", label: "Back to roster" }}
      />
    );
  }

  let result: Awaited<ReturnType<typeof readPlayerRecord>>;
  try {
    result = await readPlayerRecord(membershipId);
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <Refusal
        title="Player record"
        message={error.message}
        action={{ href: "/design-preview/roster", label: "Back to roster" }}
      />
    );
  }
  if (result.kind === "redirect") {
    return (
      <Refusal
        title="Player record"
        message="This membership's person was merged away; the record now lives under the survivor."
        action={{ href: "/design-preview/roster", label: "Back to roster" }}
      />
    );
  }

  const person = redactPersonRecord(
    result.data.person as unknown as Record<string, unknown>,
    gate.operator.roleCodes,
  ) as unknown as Partial<PersonRecord>;

  return <PlayerRecordPreview record={result.data} person={person} />;
}
