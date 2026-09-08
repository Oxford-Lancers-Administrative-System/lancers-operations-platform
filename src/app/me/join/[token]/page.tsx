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
 * LAN-202 amendment 2: lives under the existing `/me/` prefix so the proxy's
 * early return (`path.startsWith("/me/")`) already sets `no-store`,
 * `no-referrer` and `noindex` before any Supabase work — no edit to
 * `src/proxy.ts` needed. The credential is the same durable, season-scoped
 * `person_access_tokens` row `/me/[token]` (the player's own home) already
 * reads — reused here under its own sub-route rather than a second shape.
 *
 * There is no duplicate question on this door: the credential already names
 * exactly one person, so "have you signed up before?" has nothing to ask.
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
    const resolution = await resolvePersonTokenIn(tx, token);
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
