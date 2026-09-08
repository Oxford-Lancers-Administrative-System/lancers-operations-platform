// @vitest-environment node
/**
 * Correction round 2, F-2 — `scripts/seed-onboarding-chase.mjs`'s own claims,
 * checked against the real database rather than against the script's prose.
 *
 * CI never runs this seed on its own (only `seed-local.mjs`, via
 * `scripts/ci-local-command.mjs`), so this suite spawns it itself, the same
 * idempotent way a local `db:start`/`db:reset` does — a second run changes
 * nothing, so this is safe to run alongside a locally-provisioned stack too.
 *
 * The review's own finding: Jorvik Kirkbride was documented as the mid-chase
 * / scheduled demo state but carried no phone contact point, so he rendered
 * `unmessageable`/`no_channel` like everyone else — the "scheduled" state had
 * zero rows on screen, and the comment claiming he "already carries a mobile
 * number" was false. This suite proves the fix the way the queue itself
 * would: through `readOnboardingChaseQueueInfoIn`, the one function
 * `/operate/people/missing` calls for these columns, not by re-reading
 * `contact_points` and inferring.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Client } from "pg";

vi.mock("server-only", () => ({}));

import { closePool, withTransaction } from "@/lib/db";
import { readOnboardingChaseQueueInfoIn } from "@/lib/services/onboarding-chase";
import { openObserver } from "./helpers/service-layer";
import { formatChaseNext, isNudgeable } from "@/app/operate/people/missing/chase-presentation";

const root = path.resolve(import.meta.dirname, "..");
const seedScript = path.join(root, "scripts", "seed-onboarding-chase.mjs");

let observer: Client;

async function membershipIdFor(
  client: Client,
  givenName: string,
  familyName: string,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `select m.id
       from public.season_memberships m
       join public.people p on p.id = m.person_id
      where p.given_name = $1 and p.family_name = $2 and m.status <> 'archived'
      order by m.created_at desc
      limit 1`,
    [givenName, familyName],
  );
  if (!result.rows[0]) {
    throw new Error(
      `Expected seed-local.mjs to have created ${givenName} ${familyName}, but found nobody.`,
    );
  }
  return result.rows[0].id;
}

beforeAll(async () => {
  const result = spawnSync(process.execPath, [seedScript], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(
      `seed-onboarding-chase.mjs failed (status ${result.status}):\n${result.stdout}\n${result.stderr}`,
    );
  }
  observer = await openObserver();
});

afterAll(async () => {
  await observer.end();
  await closePool();
});

describe("the seed's claimed demo states, read through the queue's own function — F-2", () => {
  it("gives Jorvik Kirkbride a reachable number, so the mid-chase 'scheduled' state is not empty", async () => {
    const membershipId = await membershipIdFor(observer, "Jorvik", "Kirkbride");
    const info = await withTransaction((tx) => readOnboardingChaseQueueInfoIn(tx, [membershipId]));
    const jorvik = info.get(membershipId);
    expect(jorvik?.hasReachableNumber).toBe(true);
    expect(jorvik?.next.kind).toBe("scheduled");
  });

  it("leaves Kenelm Netherby genuinely unreachable — the exact case F-1 fixed, not masked as plain 'exhausted'", async () => {
    const membershipId = await membershipIdFor(observer, "Kenelm", "Netherby");
    const info = await withTransaction((tx) => readOnboardingChaseQueueInfoIn(tx, [membershipId]));
    const kenelm = info.get(membershipId);
    expect(kenelm?.hasReachableNumber).toBe(false);
    expect(kenelm?.next.kind).toBe("exhausted");
    // Closes the loop with F-1's own fix: the seed's claimed state must
    // actually render refused-and-plain-worded on screen, not merely carry
    // the right raw flag.
    expect(isNudgeable(kenelm!.next, kenelm!.hasReachableNumber)).toBe(false);
    expect(formatChaseNext(kenelm!.next, kenelm!.hasReachableNumber)).toBe(
      "No phone number on file",
    );
  });

  // The round-2 report also named this comment false ("no contact point of
  // any kind"). Direct query says otherwise for the actual "Croft" — this
  // fixture happens to carry two people named Lysander (Caldicott, reachable,
  // `active`; Croft, the one this module's comment names, `onboarding`) —
  // recorded here rather than silently changed, so a future seed change that
  // makes it false will be caught rather than assumed still true.
  it("still leaves Lysander Croft with no contact point at all, matching the module's own comment", async () => {
    const result = await observer.query<{ id: string }>(
      `select p.id
         from public.people p
         join public.season_memberships m on m.person_id = p.id
        where p.given_name = 'Lysander' and p.family_name = 'Croft'
          and m.status <> 'archived'`,
    );
    expect(result.rows).toHaveLength(1);
    const contactPoints = await observer.query(
      `select 1 from public.contact_points where person_id = $1`,
      [result.rows[0].id],
    );
    expect(contactPoints.rows).toHaveLength(0);
  });
});
