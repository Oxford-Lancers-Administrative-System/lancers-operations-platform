import "server-only";

import type { Tx } from "@/lib/db";
import { createPerson, type CreatePersonDecision, type CreatePersonInput } from "./person-create";
import {
  finishRecruitmentAddIn,
  refuseIfAlreadyAMemberIn,
  requireMobileProvided,
  type FinishRecruitmentAddResult,
  type RecruitmentAddAcademic,
  type RecruitmentAddDoor,
} from "./recruitment-add";

/**
 * One operator-added recruit, written — the hand-add's whole write, shared by
 * both of its doors (LAN-487). `/operate/recruitment/new` calls it once; the
 * CSV import calls it once per applicable row, inside its own transaction.
 *
 * Mobile first, then — for a link onto a person the club already holds — the
 * "already a member this season" refusal, both before `createPerson` runs, so a
 * refused row writes nothing at all. `createPerson` joins the caller's
 * transaction; `finishRecruitmentAddIn` does the rest (fill-if-blank, the
 * prospect, opt-in evidence and note, the cycle, the audience group rule).
 */
export async function addRecruitIn(
  tx: Tx,
  params: {
    actorPersonId: string;
    seasonId: string;
    person: CreatePersonInput;
    decision: CreatePersonDecision;
    academic: RecruitmentAddAcademic;
    /** Absent for the hand-add. */
    door?: RecruitmentAddDoor;
  },
): Promise<FinishRecruitmentAddResult & { readonly personId: string }> {
  const { actorPersonId, seasonId, person, decision, academic, door } = params;

  requireMobileProvided(person.mobile);
  if (decision.kind === "link_existing") {
    await refuseIfAlreadyAMemberIn(tx, decision.personId, seasonId);
  }

  const created = await createPerson({ actorPersonId, input: person, decision });
  const finished = await finishRecruitmentAddIn(tx, {
    actorPersonId,
    personId: created.personId,
    givenName: person.givenName,
    seasonId,
    academic,
    ...(door ? { door } : {}),
  });
  return { ...finished, personId: created.personId };
}
