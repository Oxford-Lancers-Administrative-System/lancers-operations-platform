import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  INVITATION_CONFIRM_LABEL,
  INVITATION_EXCHANGE_PATH,
  INVITATION_LINK_TYPE,
  INVITATION_UNUSABLE_PATH,
  isPlausibleInvitationTokenHash,
} from "@/lib/auth/invitation";
import { EmailLinkButton, singleQueryValue } from "../email-link-button";

/**
 * `/auth/invitation` — where the invitation email lands. LAN-131, LAN-441.
 *
 * A GET exchanges nothing and contacts nothing: no Supabase client is created
 * on this page, by design. An email security scanner that pre-opens links used
 * to spend the one-time token here before the invitee clicked. Now the page
 * renders one button, and `./exchange/route.ts` performs the exchange on its
 * POST under every rule that route records.
 *
 * A link that is not an invitation-shaped token goes straight to the same
 * `/invitation-link` screen a failed exchange reaches, with nothing in the
 * query string — no oracle, and no network call to find out.
 */
export const metadata: Metadata = {
  title: "Set up your account — Lancers Operations",
  robots: { index: false, follow: false },
};

export default async function InvitationPage({ searchParams }: PageProps<"/auth/invitation">) {
  const query = await searchParams;
  const tokenHash = singleQueryValue(query.token_hash);
  const type = singleQueryValue(query.type);

  if (type !== INVITATION_LINK_TYPE || !isPlausibleInvitationTokenHash(tokenHash)) {
    redirect(INVITATION_UNUSABLE_PATH);
  }

  return (
    <EmailLinkButton
      label={INVITATION_CONFIRM_LABEL}
      exchangePath={INVITATION_EXCHANGE_PATH}
      tokenHash={tokenHash}
      type={type}
      testId="invitation-confirm"
    />
  );
}
