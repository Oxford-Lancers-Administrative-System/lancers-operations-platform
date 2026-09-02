import { withTransaction } from "@/lib/db";
import { readLiveRecruitmentSignupCodeIn } from "@/lib/services/recruitment-signup-codes";
import { readCurrentSeasonIn } from "@/lib/services/seasons";
import { publicOrigin } from "@/app/participation/origin";
import { gateShellPage } from "../../gate";
import QrCodeView from "./qr-code-view";

/**
 * `/operate/recruitment/qr` — `W1-04`. One live sign-up code per season,
 * pointing at `W7`'s own QR door (`/join/[code]`, LAN-202). Reached from the
 * board's own `QR CODE` button.
 */
export default async function RecruitmentQrPage() {
  const gate = await gateShellPage("/operate/recruitment/qr", "person_record_authority");
  if ("screen" in gate) return gate.screen;

  const [origin, { season, code }] = await Promise.all([
    publicOrigin(),
    withTransaction(async (tx) => {
      const currentSeason = await readCurrentSeasonIn(tx);
      const liveCode = await readLiveRecruitmentSignupCodeIn(tx, currentSeason.id);
      return { season: currentSeason, code: liveCode };
    }),
  ]);

  const joinUrl = code ? `${origin}/join/${code.code}` : null;

  return (
    <QrCodeView
      seasonLabel={season.label}
      joinUrl={joinUrl}
      signInCount={code?.signInCount ?? 0}
      mintedAt={code?.mintedAt ?? null}
    />
  );
}
