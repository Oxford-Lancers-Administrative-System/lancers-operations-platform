/**
 * Known link-preview fetchers and crawlers — LAN-498 (Brian, 31 October 2026).
 *
 * The answer page arms nothing for these agents, on either channel, and
 * `submitAnswer` refuses to record for them. This is a backstop beside the
 * real rules, never a replacement: WhatsApp's fetcher runs no script anyway,
 * and mail scanners (Safe Links, Defender, Mimecast, Proofpoint) often
 * present an ordinary browser User-Agent, which is why email keeps its
 * touch rule.
 *
 * Narrow on purpose, because a false match blocks a real player's answer.
 * WhatsApp's fetcher is matched only as a User-Agent that *starts* with
 * `WhatsApp/`; an in-app browser that merely mentions WhatsApp, Facebook
 * (`FBAN`/`FBAV`) or Instagram is a person and is not matched. The generic
 * patterns match whole words (`bot`, `crawler`, `spider`) or a product token
 * ending in them before its version (`Somebot/1.0`), so a phone model such as
 * "CUBOT" is not matched. "Preview" is matched only as a product token with a
 * version (`Preview/0.5`, `SkypeUriPreview/1.0`): as a plain word it appears
 * in real browsers' User-Agents (preview builds), and those are people.
 */
export const PREVIEW_AGENT_PATTERNS: readonly {
  readonly name: string;
  readonly pattern: RegExp;
}[] = [
  { name: "WhatsApp", pattern: /^WhatsApp\// },
  { name: "facebookexternalhit", pattern: /facebookexternalhit/i },
  { name: "Facebot", pattern: /\bFacebot\b/i },
  { name: "meta-externalagent", pattern: /meta-externalagent/i },
  { name: "Twitterbot", pattern: /\bTwitterbot\b/i },
  { name: "Slackbot", pattern: /\bSlackbot\b/i },
  { name: "LinkedInBot", pattern: /\bLinkedInBot\b/i },
  { name: "TelegramBot", pattern: /\bTelegramBot\b/i },
  { name: "Discordbot", pattern: /\bDiscordbot\b/i },
  { name: "Applebot", pattern: /\bApplebot\b/i },
  { name: "Googlebot", pattern: /\bGooglebot\b/i },
  { name: "bingbot", pattern: /\bbingbot\b/i },
  { name: "generic word", pattern: /\b(?:bot|crawler|spider)\b/i },
  { name: "preview product token", pattern: /\w*Preview\/\d/ },
  { name: "generic product token", pattern: /[a-z](?:bot|crawler|spider)\/\d/i },
];

export function isPreviewAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return PREVIEW_AGENT_PATTERNS.some(({ pattern }) => pattern.test(userAgent));
}
