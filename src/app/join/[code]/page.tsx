import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public-shell";

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
export const metadata: Metadata = {
  title: "Join the Oxford Lancers",
  robots: { index: false, follow: false },
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
