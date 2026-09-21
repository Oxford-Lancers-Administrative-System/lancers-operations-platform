/**
 * The committed flowcharts are the specs — LAN-399.
 *
 * Brian's decision of 21 September 2026 is committed SVG files and no diagram
 * library: the pages load `/guide/<slug>.svg` through an ordinary `<img>`, so
 * nothing executes, no Content Security Policy changes, and the drawing is
 * cached like any other asset.
 *
 * A committed artefact generated from a spec goes stale the first time somebody
 * edits the spec and forgets the artefact, so this file removes the possibility:
 * every diagram is rendered and compared to the file the pages actually serve.
 * Editing `diagrams.ts` and regenerating are one action — `npx vitest run
 * src/app/operate/admin/guide/_playbook/flowchart.test.ts -u` writes the files.
 *
 * The rest of the suite is about the drawing being *readable*, which a file
 * comparison cannot tell you: no two boxes on one grid cell, every arrow
 * between boxes that exist, one legend, and the colours drawn from the token
 * module rather than typed as hex.
 */
import { describe, expect, it } from "vitest";

import { CLUB } from "@/theme-tokens";
import { PLAYBOOK_PAGES } from "./content";
import { DIAGRAMS } from "./diagrams-by-slug";
import { renderFlowchart, SHAPE_LEGEND, type FlowDiagram } from "./flowchart";

const entries = Object.entries(DIAGRAMS) as [string, FlowDiagram][];

describe("the committed SVG is the rendered spec", () => {
  it.each(entries)("public/guide/%s.svg", async (slug, diagram) => {
    await expect(renderFlowchart(diagram)).toMatchFileSnapshot(
      `../../../../../../public/guide/${slug}.svg`,
    );
  });
});

describe("every page has a drawing, and every drawing has a page", () => {
  it("covers the eight workflows and nothing else", () => {
    expect(Object.keys(DIAGRAMS).sort()).toEqual(PLAYBOOK_PAGES.map((page) => page.slug).sort());
  });

  it("points each page at its own file", () => {
    for (const page of PLAYBOOK_PAGES) {
      expect(page.flowchart.src, page.slug).toBe(`/guide/${page.slug}.svg`);
    }
  });
});

describe("the drawings are legible", () => {
  it.each(entries)("%s puts no two boxes on one grid cell", (_slug, diagram) => {
    const cells = diagram.nodes.map((node) => `${node.col}:${node.row}`);
    expect(new Set(cells).size).toBe(cells.length);
  });

  it.each(entries)("%s draws every arrow between boxes that exist", (_slug, diagram) => {
    const ids = new Set(diagram.nodes.map((node) => node.id));
    for (const edge of diagram.edges) {
      expect(ids.has(edge.from), `${edge.from} -> ${edge.to}`).toBe(true);
      expect(ids.has(edge.to), `${edge.from} -> ${edge.to}`).toBe(true);
    }
  });

  it.each(entries)("%s leaves no box unreachable and no box a dead end by accident", (_s, d) => {
    // Every box is on at least one arrow. A box nothing points at and nothing
    // leaves is a drawing mistake, not a flow.
    const touched = new Set(d.edges.flatMap((edge) => [edge.from, edge.to]));
    for (const node of d.nodes) expect(touched.has(node.id), node.id).toBe(true);
  });

  it.each(entries)("%s names its own title", (_slug, diagram) => {
    expect(diagram.title.length).toBeGreaterThan(10);
    expect(renderFlowchart(diagram)).toContain(`<title id="diagram-title">${diagram.title}`);
  });

  it.each(entries)("%s carries exactly one legend, with all six shapes", (_slug, diagram) => {
    const svg = renderFlowchart(diagram);
    for (const entry of SHAPE_LEGEND) {
      expect(svg.split(`>${entry.meaning}<`).length, entry.meaning).toBe(2);
    }
  });

  it.each(entries)("%s uses the club's own tokens and invents no colour", (_slug, diagram) => {
    const svg = renderFlowchart(diagram);
    const allowed = new Set<string>([
      ...Object.values(CLUB),
      "#E3EBF8",
      "#1D42A6",
      "#ECEAE6",
      "#5A5754",
    ]);
    for (const hex of svg.match(/#[0-9A-Fa-f]{6}/g) ?? []) {
      expect(allowed.has(hex), hex).toBe(true);
    }
  });
});

describe("the renderer refuses a spec it cannot draw", () => {
  it("throws rather than silently dropping an arrow to a box that is not there", () => {
    expect(() =>
      renderFlowchart({
        title: "A broken diagram",
        nodes: [{ id: "a", shape: "state", label: ["A"], col: 0, row: 0 }],
        edges: [{ from: "a", to: "b" }],
      }),
    ).toThrow(/unknown node/);
  });
});
