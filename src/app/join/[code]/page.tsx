import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public-shell";

import { CLUB_NAME, JOIN_DESCRIPTION, JOIN_TITLE } from "@/lib/brand";
import { withTransaction } from "@/lib/db";
import { resolveRecruitmentGroupLink } from "@/lib/services/recruitment-config";
import { resolveRecruitmentSignupCodeIn } from "@/lib/services/recruitment-signup-codes";

import { checkForExistingQrRecruit, submitQrSignup } from "./actions";
import SignupForm, { EMPTY_ALIAS } from "./signup-form";

/**
 * `W7` — the QR (anonymous) door. LAN-202 amendment 2: "an ordinary new public
 * route" — route protection in `src/proxy.ts` is opt-in through
 * `PROTECTED_PREFIXES`, which does not name `/join`, so nothing there needs to
 * change. This page's own `metadata` is what keeps it out of search indexes.
 *
 * Public and unauthenticated by design: it must expose nothing about the
 * club, the roster, or any other recruit. The one thing it reads is which
 * season this code opens the form for; everything else here is a fresh,
 * empty form.
 */
/**
 * The one link the club pushes at strangers, and the one card that sells it —
 * LAN-279.
 *
 * The image is `./opengraph-image.tsx`, drawn from the application mark; Next
 * finds it by convention and emits `og:image` and `twitter:image` for this
 * segment, overriding the club-wide card the rest of the application shows.
 *
 * **Static, not `generateMetadata`.** LAN-279 asks for the latter, but the card
 * it specifies contains no season and no code — the two things `params` could
 * supply — and deliberately so: a card that printed the code would leave it in
 * the chat transcript of everyone who ever saw the link. With nothing dynamic
 * to read, `generateMetadata` would be a function that ignores its argument and
 * returns a constant. This is that constant.
 *
 * `robots` is unchanged and still keeps the door out of search indexes. It does
 * not affect unfurling: WhatsApp, iMessage and Facebook fetch the card from
 * their own crawlers, which read the Open Graph tags and not this directive.
 */
export const metadata: Metadata = {
  title: { absolute: JOIN_TITLE },
  description: JOIN_DESCRIPTION,
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: CLUB_NAME,
    locale: "en_GB",
    title: JOIN_TITLE,
    description: JOIN_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: JOIN_TITLE,
    description: JOIN_DESCRIPTION,
  },
};

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function JoinPage({ params }: PageProps) {
  const { code } = await params;
  const resolved = await withTransaction((tx) => resolveRecruitmentSignupCodeIn(tx, code));
  if (resolved.state !== "valid") notFound();

  const groupLink = resolveRecruitmentGroupLink();

  return (
    <PublicShell layout="stack">
      <SignupForm
        mode="anonymous"
        initial={EMPTY_ALIAS}
        groupLink={groupLink}
        checkDuplicate={checkForExistingQrRecruit.bind(null, code)}
        submit={submitQrSignup.bind(null, code)}
      />
    </PublicShell>
  );
}
