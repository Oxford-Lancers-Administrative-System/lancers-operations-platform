import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public-shell";

import { withTransaction } from "@/lib/db";
import { resolvePersonTokenIn } from "@/lib/services/player-answer-tokens";
import { resolveRecruitmentGroupLink } from "@/lib/services/recruitment-config";
import { readSignupPrefillIn, type SignupPrefill } from "@/lib/services/recruitment-signup";

import SignupForm from "@/app/join/[code]/signup-form";
import { submitTokenSignup } from "./actions";

/**
 * `W7`'s tokenised, prefilled door — for somebody the club already has.
 * LAN-343 gave it its own route and its own credential. It used to live under
 * `/me/` on the *same* untagged durable row the player's events page resolves,
 * which meant any durable token opened it — the missing recruit gate. It now
 * accepts `recruit_signup` and nothing else. `src/proxy.ts` puts `/signup` in
 * the private-link bucket, so `no-store`/`no-referrer`/`noindex` are unchanged.
 * No duplicate question: the credential already names one person.
 */
export const metadata: Metadata = {
  title: "Join the Oxford Lancers",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

interface Resolved {
  readonly personId: string;
  readonly seasonId: string;
  readonly prefill: SignupPrefill;
}

async function resolve(token: string): Promise<Resolved | null> {
  return withTransaction(async (tx) => {
    const resolution = await resolvePersonTokenIn(tx, token, "recruit_signup");
    if (resolution.state !== "valid" || !resolution.resolved) return null;
    const prefill = await readSignupPrefillIn(tx, resolution.resolved.personId);
    return {
      personId: resolution.resolved.personId,
      seasonId: resolution.resolved.seasonId,
      prefill,
    };
  });
}

export default async function JoinWithTokenPage({ params }: PageProps) {
  const { token } = await params;
  const resolved = await resolve(token);
  if (!resolved) notFound();

  const { prefill } = resolved;
  const groupLink = resolveRecruitmentGroupLink();
  const personLabel = [prefill.givenName, prefill.familyName]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();

  return (
    <PublicShell layout="stack">
      <SignupForm
        mode="prefilled"
        initial={{
          givenName: prefill.givenName,
          familyName: prefill.familyName ?? "",
          mobile: prefill.mobile ?? "",
          collegeEmail: prefill.collegeEmail ?? "",
          email: prefill.email ?? "",
          knownAs: "",
          college: prefill.college ?? "",
          matriculationYear:
            prefill.matriculationYear !== null ? String(prefill.matriculationYear) : "",
          expectedGraduationYear:
            prefill.expectedGraduationYear !== null ? String(prefill.expectedGraduationYear) : "",
          degreeField: prefill.degreeField ?? "",
        }}
        personLabel={personLabel || null}
        groupLink={groupLink}
        submit={submitTokenSignup.bind(null, token)}
      />
    </PublicShell>
  );
}
