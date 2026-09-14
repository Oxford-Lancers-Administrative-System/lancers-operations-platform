import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TOKEN_LINK_METADATA } from "@/lib/brand";

import { withTransaction } from "@/lib/db";
import { resolveRecruitmentInterestTokenIn } from "@/lib/services/recruitment-interest-tokens";
import { readRecruitmentProspectIn } from "@/lib/services/recruitment-prospect";
import { TOKEN_PATTERN } from "@/lib/services/rsvp-tokens";

import { QuestionnaireBScreen } from "./interest-questionnaire";

/**
 * `/background/<t>` — Questionnaire B, the recruit's football background
 * (LAN-206, `recruit_interest_ask` and `recruit_interest_reminder`).
 *
 * LAN-343 gave it its own route. It used to be a branch inside `/a/[token]`,
 * tried first and falling through to the answer-token resolver when it did not
 * match — which meant one URL with two resolvers and two credentials behind it.
 * One message, one link, one credential is the rule now: this route resolves
 * `recruit_interest_request` and nothing else, and an answer token presented
 * here is as unknown as an invented one.
 *
 * This GET writes nothing, not even a use counter — the link is pasted into
 * WhatsApp, where a preview crawler fetches it before the recruit does. The
 * cookie that gates the POST is set by `src/proxy.ts` on this GET, for the same
 * reason the answer link's is: a Server Component's render may not set cookies.
 */
/** The generic club card (LAN-269) — names nothing, not even that a questionnaire exists. */
export const metadata: Metadata = TOKEN_LINK_METADATA;

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function RecruitBackgroundPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const query = await searchParams;
  const saved = firstValue(query.saved) === "1";
  const edit = firstValue(query.edit) === "1";

  // A malformed token cannot match a digest, and hashing it would be a
  // pointless round trip — `resolveRecruitmentInterestTokenIn` makes the same
  // check, and this keeps the shape of the refusal identical either way.
  if (!TOKEN_PATTERN.test(token)) notFound();

  const screen = await withTransaction(async (tx) => {
    const resolution = await resolveRecruitmentInterestTokenIn(tx, token);
    if (resolution.state !== "valid" || !resolution.resolved) return null;

    const prospect = await readRecruitmentProspectIn(tx, resolution.resolved.prospectId);
    if (!prospect) return null;

    const hasAnyAnswer = Object.values(prospect.answers).some((value) => value !== null);

    return (
      <QuestionnaireBScreen
        token={token}
        displayName={prospect.displayName}
        answers={prospect.answers}
        saved={saved}
        edit={edit}
        hasAnyAnswer={hasAnyAnswer}
      />
    );
  });

  if (screen === null) notFound();
  return screen;
}
