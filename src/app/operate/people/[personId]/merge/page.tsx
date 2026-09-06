import { notFound } from "next/navigation";
import { Refusal as KitRefusal } from "@/components/refusal";
import { isServiceError } from "@/lib/db";
import { previewPersonMerge, type PersonMergePreview } from "@/lib/services/person-merge";
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
 *
 * B5, LAN-185 correction round 2 (Brian's walk): `previewPersonMerge` refuses
 * — same record, the comparison target not on record, or already merged
 * away — by throwing, the same posture every service in this codebase takes.
 * Those are refusals the product owns, not crashes; rendered here as
 * `Refusal`, the same shape `events/[id]/edit/page.tsx` already uses for an
 * uneditable draft.
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

  let preview: PersonMergePreview;
  try {
    preview = await previewPersonMerge(personId, withId);
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return <Refusal message={error.message} personId={personId} />;
  }
  return <MergeComparison survivorRouteId={personId} preview={preview} />;
}

function Refusal({ message, personId }: { message: string; personId: string }) {
  return (
    <KitRefusal
      title="Merge two records"
      message={message}
      testId="merge-preview-refused"
      action={{ href: `/operate/people/${personId}`, label: "Back to the record" }}
    />
  );
}
