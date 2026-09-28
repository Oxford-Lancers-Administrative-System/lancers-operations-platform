// @vitest-environment node
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
  // One test per property across every diagram; each failure names the diagram.
  it("puts no two boxes on one grid cell", () => {
    const crowded = entries
      .filter(([, diagram]) => {
        const cells = diagram.nodes.map((node) => `${node.col}:${node.row}`);
        return new Set(cells).size !== cells.length;
      })
      .map(([slug]) => slug);
    expect(crowded).toEqual([]);
  });

  it("draws every arrow between boxes that exist", () => {
    const dangling = entries.flatMap(([slug, diagram]) => {
      const ids = new Set(diagram.nodes.map((node) => node.id));
      return diagram.edges
        .filter((edge) => !ids.has(edge.from) || !ids.has(edge.to))
        .map((edge) => `${slug}: ${edge.from} -> ${edge.to}`);
    });
    expect(dangling).toEqual([]);
  });

  it("leaves no box unreachable and no box a dead end by accident", () => {
    // Every box is on at least one arrow. A box nothing points at and nothing
    // leaves is a drawing mistake, not a flow.
    const isolated = entries.flatMap(([slug, diagram]) => {
      const touched = new Set(diagram.edges.flatMap((edge) => [edge.from, edge.to]));
      return diagram.nodes
        .filter((node) => !touched.has(node.id))
        .map((node) => `${slug}: ${node.id}`);
    });
    expect(isolated).toEqual([]);
  });

  it("names its own title", () => {
    const untitled = entries
      .filter(
        ([, diagram]) =>
          diagram.title.length <= 10 ||
          !renderFlowchart(diagram).includes(`<title id="diagram-title">${diagram.title}`),
      )
      .map(([slug]) => slug);
    expect(untitled).toEqual([]);
  });

  it("carries exactly one legend, with all six shapes", () => {
    const wrong = entries.flatMap(([slug, diagram]) => {
      const svg = renderFlowchart(diagram);
      return SHAPE_LEGEND.filter((entry) => svg.split(`>${entry.meaning}<`).length !== 2).map(
        (entry) => `${slug}: ${entry.meaning}`,
      );
    });
    expect(wrong).toEqual([]);
  });

  it("uses the club's own tokens and invents no colour", () => {
    const allowed = new Set<string>([
      ...Object.values(CLUB),
      "#E3EBF8",
      "#1D42A6",
      "#ECEAE6",
      "#5A5754",
    ]);
    const invented = entries.flatMap(([slug, diagram]) =>
      (renderFlowchart(diagram).match(/#[0-9A-Fa-f]{6}/g) ?? [])
        .filter((hex) => !allowed.has(hex))
        .map((hex) => `${slug}: ${hex}`),
    );
    expect(invented).toEqual([]);
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
