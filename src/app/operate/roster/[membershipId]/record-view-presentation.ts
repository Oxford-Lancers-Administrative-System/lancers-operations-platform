import type { PersonRecord } from "@/lib/services/person-record";

/** The record's own presentation helpers for `record-view.tsx`'s person-facts section. */

export function currentContact(
  contacts: PersonRecord["contacts"] | undefined,
  kind: "email" | "phone",
  scope: "personal" | "college" | null,
): string | null {
  if (!contacts) return null;
  const matches = contacts.filter(
    (contact) =>
      contact.kind === kind &&
      contact.validUntil === null &&
      (scope === null || contact.scope === scope),
  );
  if (matches.length === 0) return null;
  const preferred = matches.find((contact) => contact.isPreferred);
  return (preferred ?? matches[0]).rawValue;
}

export function joinAliases(aliases: PersonRecord["aliases"] | undefined): string | null {
  if (!aliases || aliases.length === 0) return null;
  const names = aliases.map((alias) => alias.alias);
  return names.length === 0 ? null : names.join(", ");
}

export function formatEmergencyContact(
  contact: PersonRecord["emergencyContact"] | null | undefined,
): string | null {
  if (!contact) return null;
  const name = contact.familyName
    ? `${contact.givenName} ${contact.familyName}`
    : contact.givenName;
  const detail = [contact.relationship, contact.phone, contact.email].filter(Boolean).join(" · ");
  return detail ? `${name} — ${detail}` : name;
}
