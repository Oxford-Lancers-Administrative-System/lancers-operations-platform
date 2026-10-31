/**
 * The brief's Markdown, read — LAN-508.
 *
 * One parser, and every renderer reads its output: the 900px PNG WhatsApp
 * carries, the email body, and the Preview the coach looks at (which is that
 * same PNG). So what the coach sees is what the player gets.
 *
 * It understands exactly what the toolbar writes — a heading, bold, a bullet,
 * an itinerary line — plus plain lines, the title line (`# `) and the
 * call-out (`> `) of the approved sample. Anything else is plain text: no
 * links, no images, no HTML. Nothing here produces markup; the renderers
 * build their own from these blocks and escape every character of text, so
 * raw HTML typed into the box reaches a player as the characters it is.
 *
 * Pure: no server-only import, so the editor's toolbar shares the shapes.
 */

/** A run of text, bold or not. */
export interface BriefSpan {
  readonly text: string;
  readonly bold: boolean;
}

export type BriefBlock =
  | { readonly kind: "title"; readonly spans: readonly BriefSpan[] }
  | { readonly kind: "heading"; readonly spans: readonly BriefSpan[] }
  | { readonly kind: "paragraph"; readonly spans: readonly BriefSpan[] }
  | { readonly kind: "callout"; readonly spans: readonly BriefSpan[] }
  | { readonly kind: "bullets"; readonly items: readonly (readonly BriefSpan[])[] }
  | {
      readonly kind: "itinerary";
      readonly rows: readonly { readonly time: string; readonly spans: readonly BriefSpan[] }[];
    };

/** `- 8:30 AM Arrive`, `- 14:00 Kick-off`, `- 9.15pm Bus` — a time, then what happens. */
const ITINERARY_LINE = /^- +(\d{1,2}[:.]\d{2}(?:\s?[AaPp]\.?[Mm]\.?)?)\s+(.+)$/;
const BULLET_LINE = /^- +(.+)$/;
const HEADING_LINE = /^## +(.+)$/;
const TITLE_LINE = /^# +(.+)$/;
const CALLOUT_LINE = /^> ?(.+)$/;
/** Tabs and the Unicode spaces paste brings (no-break, thin, narrow no-break, figure, ideographic). */
const PASTED_SPACE = /[\t  -   　]/g;

/** `**bold**` and nothing else. An unmatched `**` is the two characters it is. */
export function parseSpans(line: string): BriefSpan[] {
  const spans: BriefSpan[] = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (const match of line.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) spans.push({ text: line.slice(last, at), bold: false });
    spans.push({ text: match[1], bold: true });
    last = at + match[0].length;
  }
  if (last < line.length) spans.push({ text: line.slice(last), bold: false });
  return spans.filter((span) => span.text !== "");
}

/** The brief, as blocks. Blank lines separate; consecutive list lines group. */
export function parseBrief(markdown: string): BriefBlock[] {
  const blocks: BriefBlock[] = [];
  let bullets: BriefSpan[][] | null = null;
  let rows: { time: string; spans: BriefSpan[] }[] | null = null;

  const flush = () => {
    if (bullets) blocks.push({ kind: "bullets", items: bullets });
    if (rows) blocks.push({ kind: "itinerary", rows });
    bullets = null;
    rows = null;
  };

  for (const raw of markdown.replace(/\r\n|\r/g, "\n").split("\n")) {
    // Text pasted from WhatsApp, Notes or a document arrives indented or with
    // no-break spaces after the marks; read the line as the coach sees it.
    const line = raw.replace(PASTED_SPACE, " ").trim();
    if (line === "") {
      flush();
      continue;
    }
    const itinerary = ITINERARY_LINE.exec(line);
    if (itinerary) {
      if (bullets) flush();
      rows ??= [];
      rows.push({ time: itinerary[1], spans: parseSpans(itinerary[2]) });
      continue;
    }
    const bullet = BULLET_LINE.exec(line);
    if (bullet) {
      if (rows) flush();
      bullets ??= [];
      bullets.push(parseSpans(bullet[1]));
      continue;
    }
    flush();
    const heading = HEADING_LINE.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", spans: parseSpans(heading[1]) });
      continue;
    }
    const title = TITLE_LINE.exec(line);
    if (title) {
      blocks.push({ kind: "title", spans: parseSpans(title[1]) });
      continue;
    }
    const callout = CALLOUT_LINE.exec(line);
    if (callout) {
      blocks.push({ kind: "callout", spans: parseSpans(callout[1]) });
      continue;
    }
    blocks.push({ kind: "paragraph", spans: parseSpans(line) });
  }
  flush();
  return blocks;
}

/** The brief as plain text: the email's text part, with the Markdown marks taken off. */
export function briefPlainText(markdown: string): string {
  const text = (spans: readonly BriefSpan[]) => spans.map((span) => span.text).join("");
  return parseBrief(markdown)
    .map((block) => {
      switch (block.kind) {
        case "title":
        case "heading":
          return text(block.spans).toUpperCase();
        case "paragraph":
        case "callout":
          return text(block.spans);
        case "bullets":
          return block.items.map((item) => `• ${text(item)}`).join("\n");
        case "itinerary":
          return block.rows.map((row) => `${row.time}  ${text(row.spans)}`).join("\n");
      }
    })
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// The toolbar — what each of the four buttons writes
// ---------------------------------------------------------------------------

export type BriefFormat = "title" | "heading" | "bold" | "bullet" | "highlight" | "itinerary";

/** What the Itinerary button writes on an empty line; "Event name" is left selected to type over. */
const ITINERARY_TIME = "- 12:00 ";
const ITINERARY_PLACEHOLDER = "Event name";

const LINE_PREFIXES: Readonly<Record<Exclude<BriefFormat, "bold">, string>> = Object.freeze({
  title: "# ",
  heading: "## ",
  bullet: "- ",
  highlight: "> ",
  itinerary: ITINERARY_TIME,
});

export interface BriefEdit {
  readonly value: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
}

/**
 * Applies one toolbar button to the box. Bold wraps the selection in `**`
 * (or inserts an empty pair at the caret); the four line formats put their
 * mark at the start of every selected line, replacing any mark a line already
 * has (title, heading, highlight, bullet, itinerary).
 */
export function applyBriefFormat(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  format: BriefFormat,
): BriefEdit {
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));

  if (format === "bold") {
    const selected = value.slice(start, end);
    const next = `${value.slice(0, start)}**${selected}**${value.slice(end)}`;
    return { value: next, selectionStart: start + 2, selectionEnd: end + 2 };
  }

  const prefix = LINE_PREFIXES[format];
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = value.indexOf("\n", end);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  const lines = value.slice(lineStart, lineEnd).split("\n");
  const marked = lines.map(
    (line) =>
      `${prefix}${line.replace(/^(?:#{1,2} +|> ?|- +\d{1,2}[:.]\d{2}(?:\s?[AaPp][Mm])? +|- +)/, "")}`,
  );
  const replaced = marked.join("\n");
  if (format === "itinerary" && lines.length === 1) {
    // One line: an empty (or whitespace-only) one gets the whole row with its name
    // selected; a written one keeps its words, selected, behind the time.
    const text = marked[0].slice(prefix.length);
    const name = text.replace(PASTED_SPACE, " ").trim() === "" ? ITINERARY_PLACEHOLDER : text;
    const row = `${prefix}${name}`;
    return {
      value: `${value.slice(0, lineStart)}${row}${value.slice(lineEnd)}`,
      selectionStart: lineStart + prefix.length,
      selectionEnd: lineStart + row.length,
    };
  }
  const next = `${value.slice(0, lineStart)}${replaced}${value.slice(lineEnd)}`;
  const caret = lineStart + replaced.length;
  return { value: next, selectionStart: caret, selectionEnd: caret };
}
