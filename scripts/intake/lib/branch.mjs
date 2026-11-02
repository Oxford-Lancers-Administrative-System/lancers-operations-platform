// The final intake branch carries one mission's intake artifacts and
// nothing else: its completed ledger and its packet, landing together in the
// one owner push. Keeping the ledger out of that push is what left
// M-EVENTS-CALENDAR-TARGET-STATE's ledger dangling until a second push
// put it on `main`.

const INTAKE_ARTIFACT_DIRECTORIES = ["missions/intake", "missions/packets"];

/**
 * Check the paths in the final intake branch's diff.
 * Returns an array of human-readable errors; empty means the diff contains
 * exactly this mission's ledger and packet.
 */
export function validateFinalBranchPaths(missionId, paths) {
  const errors = [];
  if (!/^M-[A-Za-z0-9][A-Za-z0-9-]*$/.test(missionId ?? "")) {
    return ["mission id must match M-<slug>."];
  }
  if (!Array.isArray(paths) || paths.length === 0) {
    return ["the final intake branch must not be empty."];
  }

  const allowed = INTAKE_ARTIFACT_DIRECTORIES.map((directory) => `${directory}/${missionId}/`);
  const seen = new Set();
  for (const file of paths) {
    const normalised = String(file).replace(/^\.\//, "");
    const prefix = allowed.find((candidate) => normalised.startsWith(candidate));
    if (!prefix) {
      errors.push(
        `${normalised} is not an intake artifact: the final intake branch carries only ${allowed.join(" and ")}.`,
      );
      continue;
    }
    seen.add(prefix);
  }
  for (const prefix of allowed) {
    if (!seen.has(prefix)) errors.push(`the final intake branch must land ${prefix}**.`);
  }
  return errors;
}

export { INTAKE_ARTIFACT_DIRECTORIES };
