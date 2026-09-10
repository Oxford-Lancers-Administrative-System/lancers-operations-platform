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

  // The card the link unfurls with — LAN-279 item 3. A relative path, and the
  // metadata route's own address: the poster and the chat card are then the
  // same image rather than two drawings of one idea. `publicOrigin` is for the
  // printed URL, which a recruit types or scans and which therefore has to be
  // absolute; this is fetched by the operator's own browser from the host it is
  // already on.
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
