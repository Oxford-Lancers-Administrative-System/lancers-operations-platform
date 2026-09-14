/**
 * Reading a versioned agreement's body — LAN-347.
 *
 * The wording of both onboarding documents lives in
 * `onboarding_agreement_versions.body`, never in a component: a new version is
 * a new row, and the page renders whatever that row says. A body is plain text
 * (the column is `text`), optionally divided into named sections by a marker
 * line of the form `[[section-id]]`. Everything after a marker, up to the next
 * one, is that section's printed text.
 *
 * Inside a section, three line prefixes carry the shape the paper form prints,
 * and nothing else is interpreted:
 *
 *   - `## ` — a subheading
 *   - `- `  — a bulleted line, rendered with the form's own bullet
 *   - `1. ` — a numbered clause, rendered with its own printed number
 *
 * A body with no markers at all — the Code of Conduct's placeholder, until
 * LAN-282 lands Clint's wording — parses to a single unnamed section, so a
 * document that has not been rewritten still renders as plain paragraphs.
 *
 * No `server-only`: a client component renders these sections, and the parse
 * is pure text with no data access of its own.
 */

type AgreementBlockKind = "paragraph" | "subheading" | "bullet" | "numbered";

export interface AgreementBodyBlock {
  kind: AgreementBlockKind;
  /** The printed text, with any list marker removed — the marker is carried separately so it is rendered, never invented. */
  text: string;
  /** What the form prints in front of the text: the bullet, or the clause's own number. */
  marker: string | null;
}

export interface AgreementBodySection {
  /** The `[[id]]` this section was introduced by; `null` for a body with no markers. */
  id: string | null;
  blocks: AgreementBodyBlock[];
}

const SECTION_MARKER = /^\[\[([a-z0-9-]+)\]\]$/;
const NUMBERED_LINE = /^(\d+\.)\s+(.*)$/;
const BULLET_PREFIX = "- ";
const SUBHEADING_PREFIX = "## ";

/** The bullet the University's form prints. */
export const AGREEMENT_BULLET = "•";

function blockFrom(line: string): AgreementBodyBlock {
  if (line.startsWith(SUBHEADING_PREFIX)) {
    return { kind: "subheading", text: line.slice(SUBHEADING_PREFIX.length), marker: null };
  }
  if (line.startsWith(BULLET_PREFIX)) {
    return { kind: "bullet", text: line.slice(BULLET_PREFIX.length), marker: AGREEMENT_BULLET };
  }
  const numbered = NUMBERED_LINE.exec(line);
  if (numbered) {
    return { kind: "numbered", text: numbered[2], marker: numbered[1] };
  }
  return { kind: "paragraph", text: line, marker: null };
}

/** Every section of one version's body, in the order the row writes them. */
export function parseAgreementBody(body: string): AgreementBodySection[] {
  const sections: AgreementBodySection[] = [];
  let current: AgreementBodySection = { id: null, blocks: [] };

  for (const rawLine of body.split("\n")) {
    const line = rawLine.trimEnd();
    const marker = SECTION_MARKER.exec(line.trim());
    if (marker) {
      if (current.blocks.length > 0 || current.id !== null) sections.push(current);
      current = { id: marker[1], blocks: [] };
      continue;
    }
    if (line.trim() === "") continue;
    current.blocks.push(blockFrom(line));
  }
  if (current.blocks.length > 0 || current.id !== null) sections.push(current);

  return sections;
}

/** One named section, or `null` when this version does not carry it. */
export function agreementSection(
  sections: readonly AgreementBodySection[],
  id: string,
): AgreementBodySection | null {
  return sections.find((section) => section.id === id) ?? null;
}

/** A named section's first printed line — what a field's label is read from. `""` when the version has no such section. */
export function agreementLine(sections: readonly AgreementBodySection[], id: string): string {
  return agreementSection(sections, id)?.blocks[0]?.text ?? "";
}

/** Every printed line of a named section, in order. */
export function agreementLines(
  sections: readonly AgreementBodySection[],
  id: string,
): readonly string[] {
  return agreementSection(sections, id)?.blocks.map((block) => block.text) ?? [];
}

/**
 * The section that makes a printed name part of the document. The service
 * refuses a new agreement without one exactly when the version being agreed
 * declares it (LAN-347) — the wording decides what the record must carry, not
 * a per-document rule hardcoded away from the wording. The Code of Conduct's
 * placeholder declares nothing, so it records none.
 */
const PRINT_NAME_SECTION = "print-name";

export function bodyRequiresPrintedName(body: string): boolean {
  return agreementSection(parseAgreementBody(body), PRINT_NAME_SECTION) !== null;
}

/**
 * Whether this version is still the labelled placeholder LAN-214 seeded.
 * Read from the version label, not from the text: the label is the thing the
 * migration controls and the thing an agreement is recorded against.
 */
export function isPlaceholderVersion(versionLabel: string): boolean {
  return versionLabel.startsWith("placeholder");
}
