import { withTransaction } from "@/lib/db";
import { readLiveRecruitmentSignupCodeIn } from "@/lib/services/recruitment-signup-codes";
import { readCurrentSeasonIn } from "@/lib/services/seasons";
import { publicOrigin } from "@/app/participation/origin";
import { gateShellPage } from "../../gate";
import QrCodeView from "./qr-code-view";
import { ADD_RECRUITS } from "@/lib/auth/roster-access";

// `/operate/recruitment/qr` — `W1-04`. One live sign-up code per season, pointing at /join/[code] (LAN-202).
export default async function RecruitmentQrPage() {
  // LAN-432: the May add recruits switch.
  const gate = await gateShellPage("/operate/recruitment/qr", ADD_RECRUITS);
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
  // LAN-383 replaced the generated opengraph-image route with a static file, which Next serves with
  // its extension included (opengraph-image.png), not at the old extensionless route.
  const cardImageSrc = code ? `/join/${encodeURIComponent(code.code)}/opengraph-image.png` : null;

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
