import fs from "node:fs";
import path from "node:path";

/**
 * The viewports a visual handoff must actually have been looked at in, and the
 * width each one has to measure. LAN-148 §B: the phone width is the one the
 * review machine could not honestly produce — Chrome's window resizing is
 * clamped well above 375px there — so it was reported as a boolean nobody could
 * check. A browser context can be exactly 375 CSS pixels wide whatever the
 * window does, and it can be asked how wide it is.
 */
export const REQUIRED_VIEWPORTS = [
  { label: "phone375", width: 375, tolerance: 0 },
  { label: "desktop", width: 1280, tolerance: null },
];

export function reviewEvidencePath(repoPath) {
  return path.join(repoPath, ".lancers-runtime", "visual-review.json");
}

/** Where a preflight's screenshots live, beside the evidence that names them. */
export function reviewArtifactRoot(repoPath) {
  return path.join(repoPath, ".lancers-runtime", "visual-review");
}

function viewportDefects(evidence, repoPath) {
  const defects = [];
  const measured = Array.isArray(evidence.viewports) ? evidence.viewports : null;
  if (!measured) {
    return [
      "measured viewports (`viewports`: the width and height each browser context actually reported, and the screenshot each produced)",
    ];
  }
  for (const required of REQUIRED_VIEWPORTS) {
    const entry = measured.find((candidate) => candidate?.label === required.label);
    if (!entry) {
      defects.push(`a measured ${required.label} viewport`);
      continue;
    }
    const width = entry.measuredWidth;
    const height = entry.measuredHeight;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      defects.push(
        `${required.label}: measuredWidth and measuredHeight read back from the browser context`,
      );
      continue;
    }
    // An exact width is demanded where the point is the width itself. The
    // desktop entry only has to be at least as wide as the baseline.
    const matches =
      required.tolerance === null ? width >= required.width : width === required.width;
    if (!matches) {
      defects.push(
        `${required.label}: the browser context measured ${width}px, not ${
          required.tolerance === null ? `at least ${required.width}px` : `${required.width}px`
        }`,
      );
      continue;
    }
    if (typeof entry.screenshot !== "string" || entry.screenshot.trim() === "") {
      defects.push(`${required.label}: the screenshot this viewport produced`);
      continue;
    }
    const artifact = path.resolve(reviewArtifactRoot(repoPath), entry.screenshot);
    if (!artifact.startsWith(path.resolve(reviewArtifactRoot(repoPath)))) {
      defects.push(`${required.label}: the screenshot path escapes the artifact directory`);
      continue;
    }
    if (!fs.existsSync(artifact)) {
      defects.push(`${required.label}: the screenshot it names (${entry.screenshot}) is not there`);
    }
  }
  return defects;
}

export function requireVisualReviewReadiness(repoPath, applicationPort) {
  let evidence;
  try {
    evidence = JSON.parse(fs.readFileSync(reviewEvidencePath(repoPath), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT")
      throw new Error(
        "Visual review is not ready: browser-preflight evidence is missing. Continue setup; do not give Brian commands.",
      );
    throw new Error(
      `Visual review is not ready: invalid browser-preflight evidence (${error.message}).`,
    );
  }

  // LAN-148 §B. A self-reported `phone375Verified: true` is refused outright
  // rather than quietly ignored: the whole defect was that it looked satisfied.
  if ("phone375Verified" in evidence && !Array.isArray(evidence.viewports)) {
    throw new Error(
      "Visual review is not ready: `phone375Verified` is a claim, not evidence. Record `viewports` with the width and height each browser context reported and the screenshot each produced.",
    );
  }

  let target;
  try {
    target = new URL(evidence.url);
  } catch {
    throw new Error("Visual review is not ready: the verified URL is invalid.");
  }
  const loopback = ["127.0.0.1", "localhost", "::1"].includes(target.hostname);
  const checks = [
    [loopback && Number(target.port || 80) === applicationPort, "working loopback URL"],
    [evidence.loginVerified === true, "working fixed-account login"],
    [evidence.seededStatesVerified === true, "seeded review states"],
    [Array.isArray(evidence.routes) && evidence.routes.length > 0, "review routes"],
    [/^[0-9a-f]{40}$/.test(evidence.headSha ?? ""), "the exact head SHA this environment serves"],
  ];
  const missing = checks.filter(([ready]) => !ready).map(([, label]) => label);
  missing.push(...viewportDefects(evidence, repoPath));
  if (missing.length) throw new Error(`Visual review is not ready: missing ${missing.join(", ")}.`);
  return evidence;
}
