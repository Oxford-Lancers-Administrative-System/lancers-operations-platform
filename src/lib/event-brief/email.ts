/**
 * The brief as an email body — LAN-508. The same blocks the PNG is drawn from,
 * written as the inline-styled HTML an email client renders, for the club
 * shell (`src/lib/delivery/email-shell.ts`) to frame.
 *
 * Every character of the coach's text is escaped. The only markup in the
 * output is what this file writes, so a `<script>` typed into the box arrives
 * as the eight characters it is.
 */
import { parseBrief, type BriefSpan } from "./markdown";
import {
  BRIEF_BODY_SIZE,
  BRIEF_CALLOUT,
  BRIEF_GOLD,
  BRIEF_HEADING_SIZE,
  BRIEF_INK,
  BRIEF_LINE_HEIGHT,
  BRIEF_NAVY,
  BRIEF_RULE,
  BRIEF_TITLE_SIZE,
} from "./style";

function escapeBriefHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function spans(runs: readonly BriefSpan[]): string {
  return runs
    .map((run) =>
      run.bold ? `<strong>${escapeBriefHtml(run.text)}</strong>` : escapeBriefHtml(run.text),
    )
    .join("");
}

const TEXT = `color:${BRIEF_INK};font-size:${BRIEF_BODY_SIZE}px;line-height:${BRIEF_LINE_HEIGHT};`;

/** The brief's blocks as email HTML, with no frame of its own. */
export function briefEmailHtml(markdown: string): string {
  return parseBrief(markdown)
    .map((block) => {
      switch (block.kind) {
        case "title":
          return `<h2 style="margin:0 0 8px 0;color:${BRIEF_NAVY};font-size:${BRIEF_TITLE_SIZE}px;line-height:1.15;font-weight:800;">${spans(block.spans)}</h2>`;
        case "heading":
          return `<h3 style="margin:20px 0 10px 0;padding-bottom:4px;border-bottom:2px solid ${BRIEF_GOLD};color:${BRIEF_NAVY};font-size:${BRIEF_HEADING_SIZE}px;font-weight:700;">${spans(block.spans)}</h3>`;
        case "paragraph":
          return `<p style="margin:0 0 12px 0;${TEXT}">${spans(block.spans)}</p>`;
        case "callout":
          return `<p style="margin:0 0 14px 0;padding:10px 12px;background-color:${BRIEF_CALLOUT};border-left:4px solid ${BRIEF_GOLD};${TEXT}">${spans(block.spans)}</p>`;
        case "bullets":
          return `<ul style="margin:0 0 14px 0;padding-left:22px;${TEXT}">${block.items
            .map((item) => `<li style="margin:2px 0;">${spans(item)}</li>`)
            .join("")}</ul>`;
        case "itinerary":
          return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;margin:0 0 14px 0;">${block.rows
            .map(
              (row) =>
                `<tr><td style="padding:4px 14px 4px 0;border-bottom:1px solid ${BRIEF_RULE};white-space:nowrap;vertical-align:top;font-weight:700;${TEXT}">${escapeBriefHtml(row.time)}</td><td style="padding:4px 0;border-bottom:1px solid ${BRIEF_RULE};${TEXT}">${spans(row.spans)}</td></tr>`,
            )
            .join("")}</table>`;
      }
    })
    .join("\n");
}
