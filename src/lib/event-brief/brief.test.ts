// @vitest-environment node
/**
 * The brief's renderers — LAN-508. The four toolbar formats and plain lines
 * render; everything else is plain text; nothing typed into the box is ever
 * markup in what a player receives.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { briefEmailHtml } from "./email";
import { BriefImage, renderBriefPng } from "./image";
import { applyBriefFormat, briefPlainText, parseBrief, parseSpans } from "./markdown";

/** Brian's approved sample (docs/event-message-wireframe, W1-01), shortened. */
const SAMPLE = `# GAMEDAY vs Cambridge
Varsity Bowl XVII. Please read everything.

> THIS IS THE REAL THING.

## Attire
Shirt, team tie, chinos. **BLUES BLAZERS!**

## Itinerary
- 8:30 AM Arrive at Iffley Road pickup location
- 14:00 Kick-off

## What to bring
- **BOD card (must bring)**
- Helmet`;

/** The width and height a PNG declares in its IHDR chunk. */
function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** Every string a React element tree would render as text. */
function textOf(node: unknown): string[] {
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  if (Array.isArray(node)) return node.flatMap(textOf);
  if (node && typeof node === "object" && "props" in node) {
    const element = node as { type: unknown; props: Record<string, unknown> };
    if (typeof element.type === "function") {
      return textOf((element.type as (props: unknown) => unknown)(element.props));
    }
    return textOf(element.props.children);
  }
  return [];
}

describe("parseBrief", () => {
  it("reads the four toolbar formats, the title and the call-out", () => {
    const blocks = parseBrief(SAMPLE);
    expect(blocks.map((block) => block.kind)).toEqual([
      "title",
      "paragraph",
      "callout",
      "heading",
      "paragraph",
      "heading",
      "itinerary",
      "heading",
      "bullets",
    ]);
    const itinerary = blocks.find((block) => block.kind === "itinerary");
    expect(itinerary).toEqual({
      kind: "itinerary",
      rows: [
        {
          time: "8:30 AM",
          spans: [{ text: "Arrive at Iffley Road pickup location", bold: false }],
        },
        { time: "14:00", spans: [{ text: "Kick-off", bold: false }] },
      ],
    });
  });

  it("splits bold out of a line and leaves an unmatched pair as the characters it is", () => {
    expect(parseSpans("Shirt, **BLUES** tie")).toEqual([
      { text: "Shirt, ", bold: false },
      { text: "BLUES", bold: true },
      { text: " tie", bold: false },
    ]);
    expect(parseSpans("a ** b")).toEqual([{ text: "a ** b", bold: false }]);
  });

  it("reads pasted text that arrives indented or with no-break spaces", () => {
    const pasted = "  # Game day\n\n  > Kit check\n\n\t## Itinerary\n  - 10:30 Meet\n  - Helmet";
    expect(parseBrief(pasted).map((block) => block.kind)).toEqual([
      "title",
      "callout",
      "heading",
      "itinerary",
      "bullets",
    ]);
  });

  it("renders anything else as plain text", () => {
    const blocks = parseBrief("### Deep\n[link](https://example.org)\n*italic*\n1. numbered");
    expect(blocks).toEqual([
      { kind: "paragraph", spans: [{ text: "### Deep", bold: false }] },
      { kind: "paragraph", spans: [{ text: "[link](https://example.org)", bold: false }] },
      { kind: "paragraph", spans: [{ text: "*italic*", bold: false }] },
      { kind: "paragraph", spans: [{ text: "1. numbered", bold: false }] },
    ]);
  });

  it("gives the email a plain-text part with the marks taken off", () => {
    const text = briefPlainText("## Attire\n**Blazer**\n- 9:00 Bus\n- Helmet");
    expect(text).toBe("ATTIRE\n\nBlazer\n\n9:00  Bus\n\n• Helmet");
  });
});

describe("the toolbar", () => {
  it("puts a heading, bullet or itinerary mark at the start of the line, replacing another", () => {
    expect(applyBriefFormat("Attire", 3, 3, "heading").value).toBe("## Attire");
    expect(applyBriefFormat("## Helmet", 4, 4, "bullet").value).toBe("- Helmet");
    expect(applyBriefFormat("one\ntwo", 0, 7, "bullet").value).toBe("- one\n- two");
    expect(applyBriefFormat("Kick-off", 0, 0, "itinerary").value).toBe("- 12:00 Kick-off");
    expect(applyBriefFormat("- 8:30 AM Bus", 0, 0, "bullet").value).toBe("- Bus");
  });

  it("wraps the selection in bold, or opens an empty pair at the caret", () => {
    expect(applyBriefFormat("bring a helmet", 8, 14, "bold")).toEqual({
      value: "bring a **helmet**",
      selectionStart: 10,
      selectionEnd: 16,
    });
    expect(applyBriefFormat("x", 1, 1, "bold").value).toBe("x****");
  });
});

describe("the email body", () => {
  it("renders the formats as inline-styled HTML", () => {
    const html = briefEmailHtml(SAMPLE);
    expect(html).toContain(">GAMEDAY vs Cambridge</h2>");
    expect(html).toContain("<strong>BLUES BLAZERS!</strong>");
    expect(html).toContain(">8:30 AM</td>");
    expect(html).toContain('<li style="margin:2px 0;"><strong>BOD card (must bring)</strong></li>');
  });

  it("never passes raw HTML through", () => {
    const html = briefEmailHtml(
      '<script>alert(1)</script>\n## <img src=x onerror="y">\n- **<b>x</b>**',
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=&quot;y&quot;&gt;");
  });
});

describe("the image", () => {
  it("is drawn from text children only, so typed markup stays text", () => {
    const tree = BriefImage({ markdown: "<script>alert(1)</script> **<b>bold</b>**" });
    const text = textOf(tree).join(" ");
    expect(text).toContain("<script>alert(1)</script>");
    expect(text).toContain("<b>bold</b>");
  });

  it("renders a PNG exactly 900px wide, as tall as the brief", async () => {
    const short = await renderBriefPng("# Short");
    const long = await renderBriefPng(SAMPLE);
    expect([...short.slice(1, 4)].map((code) => String.fromCharCode(code)).join("")).toBe("PNG");
    expect(pngSize(short).width).toBe(900);
    expect(pngSize(long).width).toBe(900);
    expect(pngSize(long).height).toBeGreaterThan(pngSize(short).height);
  }, 30_000);
});
