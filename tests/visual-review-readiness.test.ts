// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  requireVisualReviewReadiness,
  reviewArtifactRoot,
  reviewEvidencePath,
} from "../scripts/lib/visual-review-readiness.mjs";

const roots: string[] = [];
const SHA = "a".repeat(40);

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lancers-visual-ready-"));
  roots.push(root);
  fs.mkdirSync(path.join(root, ".lancers-runtime"));
  fs.mkdirSync(reviewArtifactRoot(root), { recursive: true });
  return root;
}

/** Screenshots the evidence can honestly name. */
function shots(root: string, names: string[]) {
  for (const name of names) fs.writeFileSync(path.join(reviewArtifactRoot(root), name), "png");
}

function measured(root: string, overrides: Record<string, unknown> = {}) {
  shots(root, ["phone375.png", "desktop.png"]);
  return {
    url: "http://127.0.0.1:3010/login",
    headSha: SHA,
    loginVerified: true,
    seededStatesVerified: true,
    routes: ["/login", "/operate/roster"],
    viewports: [
      {
        label: "phone375",
        requestedWidth: 375,
        measuredWidth: 375,
        measuredHeight: 812,
        screenshot: "phone375.png",
      },
      {
        label: "desktop",
        requestedWidth: 1440,
        measuredWidth: 1440,
        measuredHeight: 900,
        screenshot: "desktop.png",
      },
    ],
    ...overrides,
  };
}

const write = (root: string, evidence: unknown) =>
  fs.writeFileSync(reviewEvidencePath(root), JSON.stringify(evidence));

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("visual review readiness", () => {
  it("refuses readiness when no preflight has run at all", () => {
    expect(() => requireVisualReviewReadiness(fixture(), 3010)).toThrow(/evidence is missing/i);
  });

  /**
   * LAN-148 §B. The defect this replaces: the gate accepted a self-reported
   * `phone375Verified: true`, and the review machine could not honestly produce
   * one — Chrome's window resizing is clamped well above 375px there. So the
   * claim was refused in practice and satisfied on paper. It is now refused
   * explicitly rather than ignored, because it looked satisfied.
   */
  it("refuses the old self-reported 375px claim by name", () => {
    const root = fixture();
    write(root, {
      url: "http://127.0.0.1:3010/login",
      headSha: SHA,
      loginVerified: true,
      seededStatesVerified: true,
      desktopVerified: true,
      phone375Verified: true,
      routes: ["/operate/roster"],
    });
    expect(() => requireVisualReviewReadiness(root, 3010)).toThrow(
      /`phone375Verified` is a claim, not evidence/,
    );
  });

  it("requires the browser context to have been asked how wide it is", () => {
    const root = fixture();
    write(root, measured(root, { viewports: undefined }));
    expect(() => requireVisualReviewReadiness(root, 3010)).toThrow(/measured viewports/);

    write(
      root,
      measured(root, {
        viewports: [
          { label: "phone375", requestedWidth: 375, screenshot: "phone375.png" },
          {
            label: "desktop",
            requestedWidth: 1440,
            measuredWidth: 1440,
            measuredHeight: 900,
            screenshot: "desktop.png",
          },
        ],
      }),
    );
    expect(() => requireVisualReviewReadiness(root, 3010)).toThrow(
      /measuredWidth and measuredHeight read back from the browser context/,
    );
  });

  it("refuses a phone viewport that measured something other than 375px", () => {
    const root = fixture();
    const evidence = measured(root);
    (evidence.viewports as Record<string, unknown>[])[0].measuredWidth = 500;
    write(root, evidence);
    expect(() => requireVisualReviewReadiness(root, 3010)).toThrow(
      /the browser context measured 500px, not 375px/,
    );
  });

  it("refuses a desktop viewport narrower than the baseline", () => {
    const root = fixture();
    const evidence = measured(root);
    (evidence.viewports as Record<string, unknown>[])[1].measuredWidth = 1024;
    write(root, evidence);
    expect(() => requireVisualReviewReadiness(root, 3010)).toThrow(
      /measured 1024px, not at least 1280px/,
    );
  });

  it("refuses a screenshot the evidence names but did not produce", () => {
    const root = fixture();
    write(root, measured(root));
    fs.rmSync(path.join(reviewArtifactRoot(root), "phone375.png"));
    expect(() => requireVisualReviewReadiness(root, 3010)).toThrow(
      /the screenshot it names \(phone375\.png\) is not there/,
    );
  });

  it("refuses a screenshot path that climbs out of the artifact directory", () => {
    const root = fixture();
    const evidence = measured(root);
    (evidence.viewports as Record<string, unknown>[])[0].screenshot = "../../../etc/hosts";
    write(root, evidence);
    expect(() => requireVisualReviewReadiness(root, 3010)).toThrow(
      /escapes the artifact directory/,
    );
  });

  it("requires the exact head SHA the environment serves", () => {
    const root = fixture();
    write(root, measured(root, { headSha: undefined }));
    expect(() => requireVisualReviewReadiness(root, 3010)).toThrow(/exact head SHA/);
  });

  it.each([
    ["loginVerified", "working fixed-account login"],
    ["seededStatesVerified", "seeded review states"],
  ])("refuses when %s is false", (field, message) => {
    const root = fixture();
    write(root, measured(root, { [field]: false }));
    expect(() => requireVisualReviewReadiness(root, 3010)).toThrow(message);
  });

  it("refuses an empty review-route list", () => {
    const root = fixture();
    write(root, measured(root, { routes: [] }));
    expect(() => requireVisualReviewReadiness(root, 3010)).toThrow(/review routes/i);
  });

  it("accepts complete measured evidence for the assigned application port", () => {
    const root = fixture();
    const evidence = measured(root);
    write(root, evidence);
    expect(requireVisualReviewReadiness(root, 3010)).toEqual(evidence);
  });

  it("refuses hosted URLs and the wrong local slot", () => {
    const root = fixture();
    write(root, measured(root, { url: "https://preview.example.test/login" }));
    expect(() => requireVisualReviewReadiness(root, 3010)).toThrow(/loopback URL/i);

    write(root, measured(root, { url: "http://localhost:3000/login" }));
    expect(() => requireVisualReviewReadiness(root, 3010)).toThrow(/loopback URL/i);
  });
});
