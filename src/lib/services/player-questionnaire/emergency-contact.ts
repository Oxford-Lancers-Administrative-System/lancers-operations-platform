/**
 * Emergency contact — the four required fields. `person_emergency_contacts`
 * is overwritten in place, not disputed (see the module note this
 * directory's barrel points to). `read.ts` reads them with their own
 * provenance (`readEmergencyContactFactsIn`).
 */

export interface EmergencyContactFacts {
  givenName: string | null;
  familyName: string | null;
  relationship: string | null;
  phone: string | null;
  email: string | null;
  /** Who last touched this row — compared against the subject to say "you" or "the club". */
  recordedByPersonId: string | null;
  recordedAt: Date | null;
}

/** The four required emergency-contact facts — `relationship` is the one left optional. */
export function emergencyContactIsComplete(facts: EmergencyContactFacts | null): boolean {
  if (!facts) return false;
  return Boolean(facts.givenName && facts.familyName && facts.phone && facts.email);
}
