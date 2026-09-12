import type { CandidateMatchField } from "@/lib/services/operator-invitations";
import type { CandidateChoice } from "./action-state";

/**
 * The line under a candidate's name, on both screens that show one.
 *
 * The caption used to end "matched on email" and print the person's contact
 * address beside it. Brian searched the invitation door for his own address —
 * which in that environment is somebody's **sign-in** address and nothing else
 * — and read a row bearing a different address and the word "email": the right
 * person, captioned as if the search had found the wrong one. A match is only
 * legible if it names the record it hit and shows the value in it, so that is
 * what this composes, and both surfaces compose it the same way.
 */

/**
 * Given and family names share one label. The row's own line already prints
 * the formal name, so naming the record is the whole of what is left to say —
 * repeating the name under itself reads as a second, different fact.
 */
const MATCH_LABEL: Record<CandidateMatchField, string> = {
  "given name": "Name matches",
  "family name": "Name matches",
  "known as": "Known as matches",
  "sign-in address": "Sign-in address matches",
  "contact email": "Contact email matches",
  phone: "Phone matches",
};

const NAMELESS: ReadonlySet<CandidateMatchField> = new Set<CandidateMatchField>([
  "given name",
  "family name",
]);

/** One clause per record hit — `Sign-in address matches: a@b.example`, `Name matches`. */
function candidateMatchClauses(matchedOn: CandidateChoice["matchedOn"]): string[] {
  const clauses: string[] = [];
  for (const match of matchedOn) {
    const label = MATCH_LABEL[match.field];
    // Two name arms can hit at once; they are one statement to a reader.
    if (clauses.includes(label)) continue;
    clauses.push(NAMELESS.has(match.field) || !match.value ? label : `${label}: ${match.value}`);
  }
  return clauses;
}

function matchedValues(matchedOn: CandidateChoice["matchedOn"]): Set<string> {
  const values = new Set<string>();
  for (const match of matchedOn) {
    if (match.value) values.add(match.value.trim().toLowerCase());
  }
  return values;
}

/**
 * The whole caption, ending in whatever that screen calls the account state.
 *
 * The standing contact details stay where they were — but only while they are
 * not themselves the thing that matched, because the clause below already
 * prints those, and one address twice in one line is the confusion this fix
 * exists to remove.
 */
export function candidateCaption(candidate: CandidateChoice, accountState: string): string {
  const matched = matchedValues(candidate.matchedOn);
  const shown = (value: string | null) =>
    value && !matched.has(value.trim().toLowerCase()) ? value : null;

  const knownAs = shown(candidate.knownAs);
  return [
    // LAN-306, rule 8: its own value beside the formal name, never spliced
    // into it. A candidate can surface on it alone.
    knownAs ? `Known as ${knownAs}` : null,
    shown(candidate.email),
    ...candidateMatchClauses(candidate.matchedOn),
    accountState,
  ]
    .filter(Boolean)
    .join(" · ");
}
