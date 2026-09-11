// One rule for "this operator-entered text is a web address", and one copy of it (LAN-284, LAN-272 F1). Pure: no database, no server-only.

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function safeUri(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (hasControlCharacter(trimmed)) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return trimmed;
}

export function isSafeUri(value: string | null | undefined): boolean {
  if (value === null || value === undefined || value.trim() === "") return true;
  return safeUri(value) !== null;
}
