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
 * `W7` — the QR (anonymous) door. LAN-202 amendment 2: an ordinary new public
 * route — `src/proxy.ts`'s `PROTECTED_PREFIXES` does not name `/join`.
 * Public and unauthenticated by design: exposes nothing about the club, the
 * roster, or any other recruit.
 *
 * Static, not `generateMetadata` (LAN-279): the card contains no season and
 * no code, deliberately, so nothing dynamic exists to read. `robots` keeps
 * the door out of search indexes without affecting unfurling.
 *
 * Decision history: missions/intake/M-RECRUITMENT
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
