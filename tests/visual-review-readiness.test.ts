// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  requireVisualReviewReadiness,
  reviewEvidencePath,
} from "../scripts/lib/visual-review-readiness.mjs";

const roots: string[] = [];
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lancers-visual-ready-"));
  roots.push(root);
  fs.mkdirSync(path.join(root, ".lancers-runtime"));
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("visual review readiness", () => {
  it("refuses readiness until every browser-proven fact is present", () => {
    const root = fixture();
    expect(() => requireVisualReviewReadiness(root, 3010)).toThrow(/evidence is missing/i);

    fs.writeFileSync(
      reviewEvidencePath(root),
      JSON.stringify({
        url: "http://localhost:3010/login",
        loginVerified: true,
        seededStatesVerified: true,
        desktopVerified: true,
        phone375Verified: false,
        routes: ["/operate/roster"],
      }),
    );
    expect(() => requireVisualReviewReadiness(root, 3010)).toThrow(/375px/i);
  });

  it.each([
    ["loginVerified", "working fixed-account login"],
    ["seededStatesVerified", "seeded review states"],
    ["desktopVerified", "desktop browser review"],
    ["phone375Verified", "375px browser review"],
  ])("refuses when %s is false", (field, message) => {
    const root = fixture();
    const evidence = {
      url: "http://localhost:3010/login",
      loginVerified: true,
      seededStatesVerified: true,
      desktopVerified: true,
      phone375Verified: true,
      routes: ["/login"],
      [field]: false,
    };
    fs.writeFileSync(reviewEvidencePath(root), JSON.stringify(evidence));
    expect(() => requireVisualReviewReadiness(root, 3010)).toThrow(message);
  });

  it("refuses an empty review-route list", () => {
    const root = fixture();
    fs.writeFileSync(
      reviewEvidencePath(root),
      JSON.stringify({
        url: "http://localhost:3010/login",
        loginVerified: true,
        seededStatesVerified: true,
        desktopVerified: true,
        phone375Verified: true,
        routes: [],
      }),
    );
    expect(() => requireVisualReviewReadiness(root, 3010)).toThrow(/review routes/i);
  });

  it("accepts complete loopback evidence for the assigned application port", () => {
    const root = fixture();
    const evidence = {
      url: "http://127.0.0.1:3010/login",
      loginVerified: true,
      seededStatesVerified: true,
      desktopVerified: true,
      phone375Verified: true,
      routes: ["/login", "/operate/roster"],
    };
    fs.writeFileSync(reviewEvidencePath(root), JSON.stringify(evidence));
    expect(requireVisualReviewReadiness(root, 3010)).toEqual(evidence);
  });

  it("refuses hosted URLs and the wrong local slot", () => {
    const root = fixture();
    const base = {
      loginVerified: true,
      seededStatesVerified: true,
      desktopVerified: true,
      phone375Verified: true,
      routes: ["/login"],
    };
    fs.writeFileSync(
      reviewEvidencePath(root),
      JSON.stringify({ ...base, url: "https://preview.example.test/login" }),
    );
    expect(() => requireVisualReviewReadiness(root, 3010)).toThrow(/loopback URL/i);

    fs.writeFileSync(
      reviewEvidencePath(root),
      JSON.stringify({ ...base, url: "http://localhost:3000/login" }),
    );
    expect(() => requireVisualReviewReadiness(root, 3010)).toThrow(/loopback URL/i);
  });
});
