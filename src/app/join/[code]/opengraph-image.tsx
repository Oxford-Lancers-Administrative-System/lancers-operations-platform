import { readFile } from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";

import { CLUB_NAVY, JOIN_CARD_WORDS } from "@/lib/brand";

/**
 * The sign-up link's own preview card — LAN-279. The one route with its own
 * image, because it is the one link the club pushes at strangers. Drawn from
 * `public/brand/crest.svg` at request time, not supplied as a file, so it
 * stays in step when Brian replaces the logo (LAN-278). Reads nothing from
 * `params`: no season, no code, nothing about the recruit — a card printing
 * the code would put it in the chat transcript, outliving the code itself.
 *
 * Decision history: docs/ux/design-system.md (LAN-279 has no ticket contract)
 */
export const alt = `${JOIN_CARD_WORDS} — Oxford Lancers`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Module-level promise, read once per server process rather than per crawler request. */
const crest = readFile(path.join(process.cwd(), "public/brand/crest.svg"), "utf8");

export default async function JoinSignupCard() {
  const mark = await crest;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: CLUB_NAVY,
        color: "#FFFFFF",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders
            an ImageResponse; next/image has no meaning in this runtime. */}
      <img
        src={`data:image/svg+xml;base64,${Buffer.from(mark).toString("base64")}`}
        alt=""
        width={268}
        height={293}
        style={{ marginBottom: 44 }}
      />
      <div style={{ display: "flex", fontSize: 86, fontWeight: 700, letterSpacing: -2 }}>
        {JOIN_CARD_WORDS}
      </div>
      {/* The gold band from the crest's own lettering, as a rule under the
            words. Enough to say the card belongs to a club with colours. */}
      <div
        style={{
          display: "flex",
          width: 220,
          height: 6,
          backgroundColor: "#8D7149",
          marginTop: 36,
        }}
      />
    </div>,
    size,
  );
}
