import { readFile } from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";

import { CLUB_NAVY, JOIN_CARD_WORDS } from "@/lib/brand";

/**
 * The sign-up link's own preview card — LAN-279.
 *
 * ## Why this route has an image and no other does
 *
 * Every other route in the application shows the club's supplied `OG Image.png`
 * (LAN-269). This one does not, because it is the one link the club pushes at
 * strangers — off a poster at the freshers' fair, into a group chat somebody
 * forwards. A general club card asks a fresher to work out what they are being
 * offered; "Join the Lancers" tells them, and the card is the whole of what
 * most of them will ever read before deciding.
 *
 * ## Why it is drawn rather than supplied
 *
 * LAN-279: "generate it from the logo in code so it stays in step with
 * LAN-278". The mark below is `public/brand/crest.svg` itself, read at request
 * time. When Brian replaces the application logo again, this card changes with
 * it and nobody has to remember that a second copy exists. If he supplies
 * finished artwork instead, this file is replaced by an `opengraph-image.png`
 * in this same directory and the metadata does not change.
 *
 * ## What it must not carry
 *
 * No season, no code, and nothing about the recruit. The code is a public
 * season-level value — which is what makes a specific card safe here at all —
 * but a card that printed it would put it in the chat transcript of everyone
 * who ever saw the link, outliving the code itself. Nothing here reads
 * `params`, so it cannot.
 *
 * `alt` is what a screen reader announces when the card is shown in a client
 * that supports it, and what Twitter reads out; it is not decorative.
 */
export const alt = `${JOIN_CARD_WORDS} — Oxford Lancers`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Read once per server process, not once per crawler.
 *
 * This is a module-level promise rather than a `readFile` inside the handler:
 * link previews arrive in bursts — one message pasted into a group chat is one
 * fetch per participant's client — and each would otherwise hit the disk.
 */
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
