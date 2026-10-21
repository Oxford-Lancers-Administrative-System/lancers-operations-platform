import "server-only";

import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";
import type { CSSProperties, ReactElement } from "react";

import { parseBrief, type BriefBlock, type BriefSpan } from "./markdown";
import {
  BRIEF_BODY_SIZE,
  BRIEF_CALLOUT,
  BRIEF_GOLD,
  BRIEF_HEADING_SIZE,
  BRIEF_IMAGE_WIDTH,
  BRIEF_INK,
  BRIEF_LINE_HEIGHT,
  BRIEF_NAVY,
  BRIEF_PADDING,
  BRIEF_PAPER,
  BRIEF_RULE,
  BRIEF_TIME_WIDTH,
  BRIEF_TITLE_SIZE,
} from "./style";

/**
 * The brief as a PNG, 900px wide — LAN-508. What WhatsApp carries as the
 * image header of `lancers_event_brief_image_v1`, and what the Preview shows
 * the coach, through the same function: the form and the event page fetch it
 * from `/api/event-messages/…`, so the preview is the player's image, not a
 * second rendering of it.
 *
 * Drawn by `ImageResponse` from `next/og` (Satori, then Resvg) with no
 * height given, so the image is as tall as the brief. Satori lays out with
 * flexbox only, so running text is laid out a word at a time in a wrapping
 * row; that is what lets a bold word sit inside a sentence. The coach's text
 * reaches Satori as React text children, never as markup, so nothing typed
 * into the box is interpreted.
 *
 * The fonts are Geist Regular and Bold, read from `public/fonts/geist`
 * (SIL Open Font Licence, beside them), because the standalone server ships
 * `public/` and the default `next/og` font has no bold.
 */

const FONT_DIRECTORY = path.join(process.cwd(), "public", "fonts", "geist");

let fonts: Promise<{ regular: Buffer; bold: Buffer }> | null = null;

function loadFonts(): Promise<{ regular: Buffer; bold: Buffer }> {
  fonts ??= Promise.all([
    readFile(path.join(FONT_DIRECTORY, "Geist-Regular.ttf")),
    readFile(path.join(FONT_DIRECTORY, "Geist-Bold.ttf")),
  ]).then(([regular, bold]) => ({ regular, bold }));
  return fonts;
}

/** One word, possibly crossing a bold boundary ("**BLUES**!"), as a flex row of runs. */
interface Word {
  readonly runs: readonly BriefSpan[];
}

function words(spans: readonly BriefSpan[]): Word[] {
  const result: BriefSpan[][] = [];
  let current: BriefSpan[] = [];
  for (const span of spans) {
    const pieces = span.text.split(/(\s+)/);
    for (const piece of pieces) {
      if (piece === "") continue;
      if (/^\s+$/.test(piece)) {
        if (current.length > 0) result.push(current);
        current = [];
        continue;
      }
      current.push({ text: piece, bold: span.bold });
    }
  }
  if (current.length > 0) result.push(current);
  return result.map((runs) => ({ runs }));
}

function Text({ spans, style }: { spans: readonly BriefSpan[]; style?: CSSProperties }) {
  const size = typeof style?.fontSize === "number" ? style.fontSize : BRIEF_BODY_SIZE;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", ...style }}>
      {words(spans).map((word, index) => (
        <div key={index} style={{ display: "flex", marginRight: Math.round(size * 0.25) }}>
          {word.runs.map((run, at) => (
            <span key={at} style={{ fontWeight: run.bold ? 700 : 400 }}>
              {run.text}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function Block({ block, first }: { block: BriefBlock; first: boolean }): ReactElement {
  switch (block.kind) {
    case "title":
      return (
        <Text
          spans={block.spans.map((span) => ({ ...span, bold: true }))}
          style={{
            color: BRIEF_NAVY,
            fontSize: BRIEF_TITLE_SIZE,
            lineHeight: 1.15,
            marginBottom: 8,
          }}
        />
      );
    case "heading":
      return (
        <Text
          spans={block.spans.map((span) => ({ ...span, bold: true }))}
          style={{
            color: BRIEF_NAVY,
            fontSize: BRIEF_HEADING_SIZE,
            marginTop: first ? 0 : 20,
            marginBottom: 10,
            paddingBottom: 4,
            borderBottom: `2px solid ${BRIEF_GOLD}`,
          }}
        />
      );
    case "paragraph":
      return <Text spans={block.spans} style={{ marginBottom: 12 }} />;
    case "callout":
      return (
        <div
          style={{
            display: "flex",
            backgroundColor: BRIEF_CALLOUT,
            borderLeft: `4px solid ${BRIEF_GOLD}`,
            padding: "10px 12px",
            marginBottom: 14,
          }}
        >
          <Text spans={block.spans} />
        </div>
      );
    case "bullets":
      return (
        <div style={{ display: "flex", flexDirection: "column", marginBottom: 14 }}>
          {block.items.map((item, index) => (
            <div key={index} style={{ display: "flex", marginTop: 2, marginBottom: 2 }}>
              <span style={{ width: 22, flexShrink: 0, paddingLeft: 6 }}>•</span>
              <Text spans={item} style={{ flex: 1 }} />
            </div>
          ))}
        </div>
      );
    case "itinerary":
      return (
        <div style={{ display: "flex", flexDirection: "column", marginBottom: 14 }}>
          {block.rows.map((row, index) => (
            <div
              key={index}
              style={{
                display: "flex",
                paddingTop: 4,
                paddingBottom: 4,
                borderBottom: `1px solid ${BRIEF_RULE}`,
              }}
            >
              <span style={{ width: BRIEF_TIME_WIDTH, flexShrink: 0, fontWeight: 700 }}>
                {row.time}
              </span>
              <Text spans={row.spans} style={{ flex: 1 }} />
            </div>
          ))}
        </div>
      );
  }
}

/** The brief's element tree, exactly as Satori draws it. */
export function BriefImage({ markdown }: { markdown: string }): ReactElement {
  const blocks = parseBrief(markdown);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: BRIEF_IMAGE_WIDTH,
        padding: BRIEF_PADDING,
        backgroundColor: BRIEF_PAPER,
        color: BRIEF_INK,
        fontFamily: "Geist",
        fontSize: BRIEF_BODY_SIZE,
        lineHeight: BRIEF_LINE_HEIGHT,
      }}
    >
      {blocks.map((block, index) => (
        <Block key={index} block={block} first={index === 0} />
      ))}
    </div>
  );
}

/** The PNG, as a response — what the preview routes answer with. */
export async function briefImageResponse(
  markdown: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  const { regular, bold } = await loadFonts();
  return new ImageResponse(<BriefImage markdown={markdown} />, {
    width: BRIEF_IMAGE_WIDTH,
    // No height: Satori measures the brief, so the image is exactly as tall as it is.
    height: undefined,
    fonts: [
      { name: "Geist", data: regular, weight: 400, style: "normal" },
      { name: "Geist", data: bold, weight: 700, style: "normal" },
    ],
    headers,
  });
}

const CACHE_LIMIT = 16;
const cache = new Map<string, Uint8Array>();

/**
 * The PNG bytes for one brief. A send renders once and every recipient's copy
 * reuses it, so a small in-process cache keyed by the brief's own hash.
 */
export async function renderBriefPng(markdown: string): Promise<Uint8Array> {
  const key = crypto.createHash("sha256").update(markdown).digest("hex");
  const hit = cache.get(key);
  if (hit) return hit;
  const response = await briefImageResponse(markdown);
  const bytes = new Uint8Array(await response.arrayBuffer());
  cache.set(key, bytes);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  return bytes;
}
