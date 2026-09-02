import "server-only";

/**
 * The WhatsApp community group link — LAN-202, "saving reveals the WhatsApp
 * community group link, on the saved page. Never before consent, and never in
 * a message."
 *
 * There is no application config for this on `main` before this package, and
 * minting the real group and its invite link is Brian's own action in
 * WhatsApp — outside this repository, and outside anything an agent may do.
 * `RECRUITMENT_WHATSAPP_GROUP_LINK` is read, never guessed and never
 * defaulted to a placeholder URL: an unset value means the saved page shows
 * the recorded consent and says the link is not live yet, rather than
 * fabricating one.
 */
export function resolveRecruitmentGroupLink(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const raw = env.RECRUITMENT_WHATSAPP_GROUP_LINK?.trim();
  return raw ? raw : null;
}
