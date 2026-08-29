"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import {
  commitAvailability,
  commitBlues,
  commitCoachGroup,
  commitEligibility,
  commitEntry,
  commitFormalwearItem,
  commitJerseyNumbers,
  commitPosition,
  type AvailabilityLevel,
  type BluesValue,
  type EligibilityStatus,
  type FormalwearItemKey,
  type Kit,
  type PositionColumn,
} from "@/lib/services/roster-board";
import type { BoardActionState } from "./board-action-state";

/**
 * The board's own server actions — LAN-186. Every one of them:
 *
 *   * opens with `requireCapability("person_record_authority")`, resolving the
 *     actor from the verified session — `REQ-authority`'s "four-role only, for
 *     the grid and every column on it" enforced here and not only by the page
 *     that renders the controls;
 *   * commits on its own, no confirmation step, and writes an audit event with
 *     no reason asked — these are all season facts;
 *   * revalidates the roster path so the refreshed server render carries the
 *     new value straight back into the cell that changed.
 *
 * The status change is deliberately **not** here, even though it is now a
 * free `select` column like every other one above. `./actions.ts` carries
 * `setMembershipStatusAction`, gated on `membership_activation` rather than
 * `person_record_authority` — a stronger grant `membership.ts` has always
 * required for this one column, and this package does not relax. The board's
 * Status cell calls that action directly rather than reimplementing a second,
 * looser path to the same column.
 */

function refresh(): void {
  revalidatePath("/operate/roster");
}

function stateFor(error: unknown): BoardActionState {
  if (!isServiceError(error)) throw error;
  if (error.kind === "not_permitted") throw error;
  return { error: error.message };
}

const OK: BoardActionState = { error: null };

export async function commitPositionAction(params: {
  membershipId: string;
  seasonId: string;
  column: PositionColumn;
  code: string | null;
}): Promise<BoardActionState> {
  const operator = await requireCapability("person_record_authority");
  try {
    await commitPosition({ actorPersonId: operator.personId, ...params });
  } catch (error) {
    return stateFor(error);
  }
  refresh();
  return OK;
}

export async function commitJerseyNumbersAction(params: {
  membershipId: string;
  seasonId: string;
  kit: Kit;
  numbers: readonly string[];
}): Promise<BoardActionState> {
  const operator = await requireCapability("person_record_authority");
  try {
    await commitJerseyNumbers({ actorPersonId: operator.personId, ...params });
  } catch (error) {
    return stateFor(error);
  }
  refresh();
  return OK;
}

export async function commitCoachGroupAction(params: {
  membershipId: string;
  seasonId: string;
  coachGroup: string | null;
}): Promise<BoardActionState> {
  const operator = await requireCapability("person_record_authority");
  try {
    await commitCoachGroup({ actorPersonId: operator.personId, ...params });
  } catch (error) {
    return stateFor(error);
  }
  refresh();
  return OK;
}

export async function commitFormalwearItemAction(params: {
  membershipId: string;
  seasonId: string;
  item: FormalwearItemKey;
  owned: boolean;
}): Promise<BoardActionState> {
  const operator = await requireCapability("person_record_authority");
  try {
    await commitFormalwearItem({ actorPersonId: operator.personId, ...params });
  } catch (error) {
    return stateFor(error);
  }
  refresh();
  return OK;
}

export async function commitBluesAction(params: {
  membershipId: string;
  seasonId: string;
  value: BluesValue;
}): Promise<BoardActionState> {
  const operator = await requireCapability("person_record_authority");
  try {
    await commitBlues({ actorPersonId: operator.personId, ...params });
  } catch (error) {
    return stateFor(error);
  }
  refresh();
  return OK;
}

export async function commitEligibilityAction(params: {
  membershipId: string;
  seasonId: string;
  status: EligibilityStatus;
}): Promise<BoardActionState> {
  const operator = await requireCapability("person_record_authority");
  try {
    await commitEligibility({ actorPersonId: operator.personId, ...params });
  } catch (error) {
    return stateFor(error);
  }
  refresh();
  return OK;
}

export async function commitAvailabilityAction(params: {
  membershipId: string;
  level: AvailabilityLevel;
}): Promise<BoardActionState> {
  const operator = await requireCapability("person_record_authority");
  try {
    await commitAvailability({ actorPersonId: operator.personId, ...params });
  } catch (error) {
    return stateFor(error);
  }
  refresh();
  return OK;
}

export async function commitEntryAction(params: {
  membershipId: string;
  entry: "new" | "returning";
}): Promise<BoardActionState> {
  const operator = await requireCapability("person_record_authority");
  try {
    await commitEntry({ actorPersonId: operator.personId, ...params });
  } catch (error) {
    return stateFor(error);
  }
  refresh();
  return OK;
}
