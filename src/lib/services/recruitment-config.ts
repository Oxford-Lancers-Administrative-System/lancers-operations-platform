import "server-only";

export function resolveRecruitmentGroupLink(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const raw = env.RECRUITMENT_WHATSAPP_GROUP_LINK?.trim();
  return raw ? raw : null;
}
