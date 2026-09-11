// Emergency contact — the four required fields. Overwritten in place, not disputed. read.ts reads them with provenance.

export interface EmergencyContactFacts {
  givenName: string | null;
  familyName: string | null;
  relationship: string | null;
  phone: string | null;
  email: string | null;
  recordedByPersonId: string | null;
  recordedAt: Date | null;
}

export function emergencyContactIsComplete(facts: EmergencyContactFacts | null): boolean {
  if (!facts) return false;
  return Boolean(facts.givenName && facts.familyName && facts.phone && facts.email);
}
