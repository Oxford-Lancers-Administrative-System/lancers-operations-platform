import { notFound } from "next/navigation";
import { isServiceError } from "@/lib/db";
import { previewPersonMerge } from "@/lib/services/person-merge";
import { readPersonRecord, searchPeople } from "@/lib/services/person-record";
import { gateShellPage } from "../../../gate";
import FindOtherRecord from "./find-other-record";
import MergeComparison from "./merge-comparison";

/**
 * `/operate/people/[personId]/merge` — W4-01 … W4-08. LAN-185, `REQ-merge`.
 *
 * Reached only from a record the operator already holds — `W1`'s search, or
 * the "Compare with …" handoff `W2-07` offers — never from a list. The
 * comparison is the most disclosing screen this mission draws, and this is
 * why: two people's contact details, academic detail, date of birth and
 * emergency contact, side by side.
 */
export default async function MergePage({
  params,
  searchParams,
}: PageProps<"/operate/people/[personId]/merge">) {
  const { personId } = await params;
  const gate = await gateShellPage(`/operate/people/${personId}/merge`, "person_record_authority");
  if ("screen" in gate) return gate.screen;

  const sp = await searchParams;
  const withId =
    typeof sp.with === "string" ? sp.with : Array.isArray(sp.with) ? sp.with[0] : undefined;
  const query = typeof sp.q === "string" ? sp.q : "";

  let survivor;
  try {
    survivor = await readPersonRecord(personId);
  } catch (error) {
    if (isServiceError(error) && error.kind === "not_found") notFound();
    throw error;
  }

  if (!withId) {
    const results = query.trim() === "" ? [] : await searchPeople(query);
    return (
      <FindOtherRecord
        personId={personId}
        displayName={survivor.displayName}
        query={query}
        results={results.filter((r) => r.personId !== personId)}
      />
    );
  }

  const preview = await previewPersonMerge(personId, withId);
  return <MergeComparison survivorRouteId={personId} preview={preview} />;
}
