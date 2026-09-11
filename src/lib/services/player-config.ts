import "server-only";

/**
 * The two destinations a player in onboarding is sent to that live outside
 * this application — the club's main WhatsApp group (LAN-327) and its Hudl
 * join link (LAN-333).
 *
 * Both are configuration, for the same reason `RECRUITMENT_WHATSAPP_GROUP_LINK`
 * is (`recruitment-config.ts`): this repository is public, and a WhatsApp
 * invite link is joinable by anyone holding it. Neither link is ever a literal
 * in code, a fixture, a test or a seed.
 *
 * A missing value is a REFUSAL, not a placeholder. `null` means the surface
 * shows no link at all rather than a broken one — for the group that is no
 * offer, and for Hudl the steps stay, stating that the link is not published
 * yet. That is the expected state for every CI run and for the deployed
 * container until Brian configures a real value.
 */

/** Trimmed, or `null` when unset or blank. The one reading both variables share. */
function configuredLink(raw: string | undefined): string | null {
  const value = raw?.trim();
  return value ? value : null;
}

/** The club's main WhatsApp group, offered to a player on their own page — LAN-327. Distinct from the rookies group recruits are offered. */
export function resolvePlayerGroupLink(
  env: Record<string, string | undefined> = process.env,
): string | null {
  return configuredLink(env.PLAYER_WHATSAPP_GROUP_LINK);
}

/** The club's Hudl join link, the first step of the questionnaire's Hudl step — LAN-333. */
export function resolveHudlJoinLink(
  env: Record<string, string | undefined> = process.env,
): string | null {
  return configuredLink(env.HUDL_JOIN_LINK);
}
