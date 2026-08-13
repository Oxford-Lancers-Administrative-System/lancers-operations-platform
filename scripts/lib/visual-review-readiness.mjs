import fs from "node:fs";
import path from "node:path";

export function reviewEvidencePath(repoPath) {
  return path.join(repoPath, ".lancers-runtime", "visual-review.json");
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
    [evidence.desktopVerified === true, "desktop browser review"],
    [evidence.phone375Verified === true, "375px browser review"],
    [Array.isArray(evidence.routes) && evidence.routes.length > 0, "review routes"],
  ];
  const missing = checks.filter(([ready]) => !ready).map(([, label]) => label);
  if (missing.length) throw new Error(`Visual review is not ready: missing ${missing.join(", ")}.`);
  return evidence;
}
