import { withTransaction } from "@/lib/db";
import { readLiveRecruitmentSignupCodeIn } from "@/lib/services/recruitment-signup-codes";
import { readCurrentSeasonIn } from "@/lib/services/seasons";
import { publicOrigin } from "@/app/participation/origin";
import { gateShellPage } from "../../gate";
import QrCodeView from "./qr-code-view";

// `/operate/recruitment/qr` — `W1-04`. One live sign-up code per season, pointing at /join/[code] (LAN-202).
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

  // Relative path (LAN-279 item 3) — fetched by the operator's own browser, unlike the absolute printed URL.
  const cardImageSrc = code ? `/join/${encodeURIComponent(code.code)}/opengraph-image` : null;

  return (
    <QrCodeView
      seasonLabel={season.label}
      joinUrl={joinUrl}
      cardImageSrc={cardImageSrc}
      signInCount={code?.signInCount ?? 0}
      mintedAt={code?.mintedAt ?? null}
    />
  );
}
