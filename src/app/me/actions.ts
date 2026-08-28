"use server";

import { redirect } from "next/navigation";

import { withTransaction } from "@/lib/db";
import { resolveOperator } from "@/lib/auth/operator";
import { readCurrentSeasonIn } from "@/lib/services/seasons";
import { issuePersonTokenIn } from "@/lib/services/player-answer-tokens";

/**
 * F-A3's repair, the one write this route makes. LAN-180.
 *
 * `/me/[token]`'s own GET is held to a no-mutation posture because its
 * credential is scanner-exposed — a WhatsApp/email link preview, a corporate
 * scanner. `/me` (this route) carries none: it is reached only from a live,
 * verified Supabase session, so nothing pre-fetches it unattended. It still
 * mints behind a click rather than a render, matching this codebase's own
 * stated rule elsewhere ("a page render must not write") rather than carving
 * an exception into it.
 *
 * `issuePersonTokenIn` cannot be "looked up" — the plaintext of any token
 * already issued no longer exists anywhere, the same rule `rsvp_access_tokens`
 * lives by — so every visit here reissues, exactly as `/a/[token]/actions.ts`'s
 * own first-answer redirect already does. That supersedes a still-live
 * durable link this person already holds from elsewhere; `submitAnswer`
 * carries the identical consequence for the identical reason, and is this
 * route's precedent rather than a new decision.
 *
 * Resolved again here, never trusted from a hidden field the page rendered a
 * moment earlier: the operator identity a write acts on always comes from the
 * verified session, not from anything the browser sent back.
 */
export async function openMyPage(): Promise<void> {
  const operator = await resolveOperator();
  if (!operator) {
    redirect("/login?redirectTo=%2Fme");
  }

  // `destination` is computed inside the transaction and `redirect()` is
  // called after it returns — `submitAnswer`'s own pattern, and for the same
  // reason: `redirect()` throws a Next.js control-flow signal, and letting
  // that unwind through an open transaction is not the same thing as
  // committing first and redirecting second.
  const destination = await withTransaction(async (tx) => {
    // The season the club is currently operating. `person_access_tokens` is
    // season-scoped and `readCurrentSeasonIn` only ever returns one whose
    // status is an operating one — never a closed season — so the credential
    // this mints starts inside the same season-closed guard
    // `resolvePersonTokenIn` re-checks every time it is used, rather than
    // needing a second copy of that rule here.
    const season = await readCurrentSeasonIn(tx);
    const issued = await issuePersonTokenIn(tx, operator.personId, season.id, {
      actorPersonId: operator.personId,
    });
    return `/me/${encodeURIComponent(issued.token)}`;
  });

  redirect(destination);
}
