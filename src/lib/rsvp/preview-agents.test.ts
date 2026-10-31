// @vitest-environment node
/**
 * LAN-498 (Brian, 31 October 2026): known preview fetchers never save an
 * answer. One case per entry in the list, and the other half that matters
 * more — a real player's browser is never matched.
 */
import { describe, expect, it } from "vitest";

import { PREVIEW_AGENT_PATTERNS, isPreviewAgent } from "./preview-agents";

/** One real-world User-Agent per entry, keyed by the entry's own name. */
const FETCHERS: Record<string, string> = {
  WhatsApp: "WhatsApp/2.23.20.0 A",
  facebookexternalhit: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  Facebot: "Facebot",
  "meta-externalagent":
    "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)",
  Twitterbot: "Twitterbot/1.0",
  Slackbot: "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
  LinkedInBot:
    "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)",
  TelegramBot: "TelegramBot (like TwitterBot)",
  Discordbot: "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
  Applebot:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)",
  Googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  bingbot: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  "generic word": "Mozilla/5.0 (compatible; link crawler)",
  "preview product token": "Mozilla/5.0 (Windows NT 6.1; WOW64) SkypeUriPreview Preview/0.5",
  "generic product token":
    "Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)",
};

describe("every listed fetcher is matched", () => {
  it("has a case here for every entry in the list", () => {
    expect(Object.keys(FETCHERS).sort()).toEqual(
      PREVIEW_AGENT_PATTERNS.map(({ name }) => name).sort(),
    );
  });

  for (const { name, pattern } of PREVIEW_AGENT_PATTERNS) {
    it(`matches ${name}`, () => {
      const userAgent = FETCHERS[name];
      expect(pattern.test(userAgent)).toBe(true);
      expect(isPreviewAgent(userAgent)).toBe(true);
    });
  }

  it("matches each generic pattern on its own", () => {
    expect(isPreviewAgent("SomeCrawler/2.0")).toBe(true);
    expect(isPreviewAgent("Mozilla/5.0 (compatible; spider)")).toBe(true);
    expect(isPreviewAgent("Mozilla/5.0 (compatible; bot)")).toBe(true);
  });
});

/** A real player's phone. None of these may ever be blocked. */
const PEOPLE: Record<string, string> = {
  "iOS Safari":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  "Android Chrome":
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.127 Mobile Safari/537.36",
  "Samsung Internet":
    "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
  "Android WebView (WhatsApp's in-app browser)":
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.127 Mobile Safari/537.36",
  "an in-app browser naming WhatsApp mid-string":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/24.10.75",
  "Facebook in-app browser on iOS":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBDV/iPhone14,2;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/en_GB;FBOP/5]",
  "Facebook in-app browser on Android":
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.127 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/478.0.0.40.86;]",
  "Instagram in-app browser":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 345.0.0.32.97 (iPhone14,2; iOS 17_5; en_GB; en-GB; scale=3.00; 1170x2532; 636431208)",
  "Gmail in-app browser on iOS":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/330.0.665236494 Mobile/15E148 Safari/604.1",
  "a CUBOT phone":
    "Mozilla/5.0 (Linux; Android 13; CUBOT KINGKONG 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
  "a browser naming Preview as a plain word":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15 Technology Preview ",
  "desktop Chrome":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
};

describe("a real player's browser is never matched", () => {
  for (const [name, userAgent] of Object.entries(PEOPLE)) {
    it(`does not match ${name}`, () => {
      expect(isPreviewAgent(userAgent)).toBe(false);
    });
  }

  it("does not match a missing or empty User-Agent", () => {
    expect(isPreviewAgent(null)).toBe(false);
    expect(isPreviewAgent(undefined)).toBe(false);
    expect(isPreviewAgent("")).toBe(false);
  });
});
