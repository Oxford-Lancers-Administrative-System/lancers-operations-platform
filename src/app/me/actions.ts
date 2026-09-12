"use server";

import { redirect } from "next/navigation";

import { withTransaction } from "@/lib/db";
import { resolveOperator } from "@/lib/auth/operator";
import { readCurrentSeasonIn } from "@/lib/services/seasons";
import { issuePersonTokenIn } from "@/lib/services/player-answer-tokens";

/**
 * F-A3's repair, the one write this route makes. LAN-180. `/me` carries no
 * scanner-exposed credential (it's session-reached), so it may mint behind a
 * click. `issuePersonTokenIn` always reissues — no token can be "looked up",
 * same rule `rsvp_access_tokens` lives by — superseding any still-live link
 * this person already holds, same precedent as `submitAnswer`. Operator
 * identity is resolved again here, never trusted from a hidden field.
 */
export async function openMyPage(): Promise<void> {
  const operator = await resolveOperator();
  if (!operator) {
    redirect("/login?redirectTo=%2Fme");
  }

  // `destination` is computed inside the transaction, `redirect()` called after
  // it returns: `redirect()` throws a control-flow signal, so it must not unwind
  // through an open transaction (`submitAnswer`'s own pattern).
  const destination = await withTransaction(async (tx) => {
    // `readCurrentSeasonIn` only ever returns an operating season, so this
    // credential starts inside the same season-closed guard
    // `resolvePersonTokenIn` re-checks on every use.
    const season = await readCurrentSeasonIn(tx);
    const issued = await issuePersonTokenIn(tx, operator.personId, season.id, {
      actorPersonId: operator.personId,
    });
    return `/events/${encodeURIComponent(issued.token)}`;
  });

  redirect(destination);
}
