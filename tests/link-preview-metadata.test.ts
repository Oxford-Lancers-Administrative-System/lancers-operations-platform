// @vitest-environment node
/**
 * What a shared link says, and what a browser tab shows — LAN-269, LAN-279.
 *
 * ## Why the exports and not the rendered HTML
 *
 * Next emits the `<meta>` and `<link>` tags from these objects and from the
 * metadata *files* beside them. Rendering a page to assert `og:site_name` would
 * be testing Next's own resolver, which Next tests; what can actually regress
 * here is the club's side of it — a description nobody rewrote, a token route
 * that quietly grew a card naming the player, an icon file that stopped being
 * committed. So this asserts the inputs, and the PR carries the rendered tags
 * fetched from a running server as evidence that the two agree.
 *
 * ## The one that matters
 *
 * `token routes say nothing` is the assertion with teeth. Everything else here
 * is presentation; that one is a disclosure boundary, and the thing it guards
 * against is somebody later deciding it would be helpful if an RSVP card named
 * the event — in a card shown to everybody in the chat, for a link that
 * identifies one person.
 */
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// `next/font/google` is a build-time transform, not a runtime module: importing
// the root layout for its `metadata` export would otherwise fail on the font
// call that has nothing to do with what is under test.
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));

import type { Metadata } from "next";

import { CLUB_NAME, SITE_DESCRIPTION, TOKEN_LINK_METADATA } from "@/lib/brand";

import { metadata as rootMetadata } from "@/app/layout";
import manifest from "@/app/manifest";
import { metadata as rsvpMetadata } from "@/app/rsvp/[token]/page";
import { metadata as answerMetadata } from "@/app/a/[answer]/[token]/page";
import { metadata as clubLinkMetadata } from "@/app/e/[token]/page";
import { metadata as eventsMetadata } from "@/app/events/[token]/page";
import { metadata as questionsMetadata } from "@/app/questions/[token]/page";
import { metadata as backgroundMetadata } from "@/app/background/[token]/page";
import { metadata as joinMetadata } from "@/app/join/[code]/page";
import { metadata as privacyMetadata } from "@/app/(policies)/privacy/page";
import { metadata as calendarMetadata } from "@/app/calendar/page";

const REPO = path.resolve(import.meta.dirname, "..");

describe("the club-wide card", () => {
  it("names the club, not the software", () => {
    // "Lancers Operations Platform" and "infrastructure scaffold" are what
    // WhatsApp showed a player until LAN-269. Neither was written for them.
    expect(rootMetadata.title).toEqual({ default: CLUB_NAME, template: `%s — ${CLUB_NAME}` });
    expect(rootMetadata.description).toBe(SITE_DESCRIPTION);
    expect(rootMetadata.description).not.toMatch(/scaffold|infrastructure|platform/i);
  });

  it("carries the site name both apps print above the card", () => {
    expect(rootMetadata.openGraph?.siteName).toBe(CLUB_NAME);
    expect(rootMetadata.openGraph?.description).toBe(SITE_DESCRIPTION);
    // `summary_large_image` is what makes the supplied 1200x630 render full
    // width in a chat rather than as a thumbnail beside the text.
    expect((rootMetadata.twitter as { card?: string })?.card).toBe("summary_large_image");
  });

  it("resolves image URLs against the deployment, never a hard-coded host", async () => {
    const layout = await readFile(path.join(REPO, "src/app/layout.tsx"), "utf8");
    expect(layout).toContain("metadataBase()");
    expect(layout).not.toMatch(/https?:\/\/(?!localhost)/);
  });
});

describe("token routes say nothing", () => {
  // LAN-343 gave every message its own route. `/me` left this list with the
  // layout that carried its card: nothing under `/me` is a token route any
  // more, and the three that took its place are named here individually rather
  // than by a prefix, so adding a fourth cannot quietly inherit a card nobody
  // checked.
  const routes: [string, Metadata][] = [
    ["/rsvp/[token]", rsvpMetadata],
    ["/a/<yes|no>/[token]", answerMetadata],
    ["/e/[token]", clubLinkMetadata],
    ["/events/[token]", eventsMetadata],
    ["/questions/[token]", questionsMetadata],
    ["/background/[token]", backgroundMetadata],
  ];

  it.each(routes)("%s shows the generic club card", (_route, metadata) => {
    expect(metadata).toBe(TOKEN_LINK_METADATA);
  });

  it("names no person, no event and no answer", () => {
    const card = JSON.stringify(TOKEN_LINK_METADATA);
    for (const leak of ["event", "invitation", "rsvp", "attending", "questionnaire", "phone"]) {
      expect(card.toLowerCase()).not.toContain(leak);
    }
    // `absolute`, so the tab reads "Oxford Lancers" and not the root
    // template's "Oxford Lancers — Oxford Lancers".
    expect(TOKEN_LINK_METADATA.title).toEqual({ absolute: CLUB_NAME });
  });

  it("still carries the club's card image", () => {
    // Next replaces `openGraph` whole, so declaring one drops the root's
    // `opengraph-image.png` unless it is named back. Measured on a running
    // server: without this the card unfurls as a bare line of text.
    expect(rsvpMetadata.openGraph?.images).toBeDefined();
    expect(JSON.stringify(rsvpMetadata.openGraph?.images)).toContain("/opengraph-image.png");
    expect(JSON.stringify(calendarMetadata.openGraph?.images)).toContain("/opengraph-image.png");
  });

  it("stays out of search indexes", () => {
    expect(TOKEN_LINK_METADATA.robots).toEqual({ index: false, follow: false });
  });

  it("reads no token to build the card", async () => {
    // A `generateMetadata` on any of these would have to resolve the token,
    // which would make the card differ between a live link and a dead one and
    // put LAN-90's uniform terminal response into a chat bubble.
    for (const file of [
      "src/app/rsvp/[token]/page.tsx",
      "src/app/a/[answer]/[token]/page.tsx",
      "src/app/e/[token]/page.tsx",
      "src/app/events/[token]/page.tsx",
      "src/app/questions/[token]/page.tsx",
      "src/app/background/[token]/page.tsx",
    ]) {
      expect(await readFile(path.join(REPO, file), "utf8")).not.toContain("generateMetadata");
    }
  });
});

describe("the pages a stranger is meant to find", () => {
  it("gives the public calendar its own title and its own card", () => {
    expect(calendarMetadata.title).toBe("Club calendar");
    // Both halves, because Next replaces `openGraph` whole: a page that sets
    // only `title` keeps unfurling with the root's words.
    expect(calendarMetadata.openGraph?.title).toBe("Club calendar");
    expect(calendarMetadata.openGraph?.description).toBe(calendarMetadata.description);
    expect(calendarMetadata.openGraph?.siteName).toBe(CLUB_NAME);
  });

  it("gives the policy pages their own, without repeating the club twice", () => {
    expect(privacyMetadata.title).toBe("Privacy notice");
    expect(privacyMetadata.title).not.toMatch(/Oxford Lancers/);
  });

  it("sells the sign-up door — LAN-279", () => {
    expect(joinMetadata.title).toEqual({ absolute: "Join the Oxford Lancers" });
    expect(joinMetadata.description).toMatch(/^Sign up in under a minute/);
    expect(joinMetadata.openGraph?.siteName).toBe(CLUB_NAME);
    // No season and no code: the card outlives the code in a chat transcript.
    expect(JSON.stringify(joinMetadata)).not.toMatch(/season|code/i);
  });
});

describe("the icons and the install prompt", () => {
  it("installs as the club, with the crest at both sizes", () => {
    const installed = manifest();
    expect(installed.name).toBe(CLUB_NAME);
    expect(installed.short_name).toBe("Lancers");
    expect(installed.theme_color).toBe("#002147");
    expect(installed.background_color).toBe("#002147");
    expect(installed.icons?.map((icon) => icon.sizes)).toEqual(["192x192", "512x512"]);
  });

  it("ships every metadata file Next needs to emit the tags", async () => {
    // Present and non-trivial. A zero-byte or placeholder icon would satisfy
    // the file convention and show a browser nothing.
    for (const [file, minimumBytes] of [
      ["src/app/favicon.ico", 1_000],
      ["src/app/icon.svg", 1_000],
      ["src/app/apple-icon.png", 1_000],
      ["src/app/opengraph-image.png", 10_000],
      ["src/app/twitter-image.png", 10_000],
      ["public/brand/icon-192.png", 1_000],
      ["public/brand/icon-512.png", 1_000],
      ["public/brand/crest.svg", 1_000],
      ["public/brand/crest-blue.svg", 1_000],
      ["public/brand/icon-mark.svg", 1_000],
      ["src/app/join/[code]/opengraph-image.tsx", 500],
      ["src/app/join/[code]/twitter-image.tsx", 100],
    ] as const) {
      const stats = await stat(path.join(REPO, file));
      expect(stats.size, `${file} is present but empty`).toBeGreaterThan(minimumBytes);
    }
  });

  it("keeps the supplied preview image exactly as supplied", async () => {
    // LAN-269: "do not generate one." The two files are the same bytes, so a
    // future edit to one that is not made to the other shows up here.
    const og = await readFile(path.join(REPO, "src/app/opengraph-image.png"));
    const twitter = await readFile(path.join(REPO, "src/app/twitter-image.png"));
    expect(og.equals(twitter)).toBe(true);

    // The PNG header carries the dimensions: bytes 16-24 of an IHDR chunk.
    expect(og.readUInt32BE(16)).toBe(1200);
    expect(og.readUInt32BE(20)).toBe(630);
  });

  it("cuts the favicon from the gold mark, at the three sizes a tab uses", async () => {
    const ico = await readFile(path.join(REPO, "src/app/favicon.ico"));
    expect(ico.readUInt16LE(0)).toBe(0); // reserved
    expect(ico.readUInt16LE(2)).toBe(1); // an icon, not a cursor
    const frames = ico.readUInt16LE(4);
    expect(frames).toBe(3);

    const sizes = Array.from({ length: frames }, (_, index) => ico.readUInt8(6 + index * 16));
    expect(sizes).toEqual([16, 32, 48]);
  });

  it("draws the header mark and the icon mark from different files", async () => {
    // The two are different logos and swapping them is the mistake
    // `public/brand/README.md` exists to prevent: one crown in the header,
    // three in the tab.
    const crest = await readFile(path.join(REPO, "public/brand/crest.svg"), "utf8");
    const icon = await readFile(path.join(REPO, "public/brand/icon-mark.svg"), "utf8");
    expect(crest).not.toEqual(icon);
    expect(icon).toContain("#8D7149"); // the gold outline
    expect(crest).not.toContain("#8D7149");
  });
});
