// The final intake pull request carries one mission's intake artifacts and
// nothing else: its completed ledger and its packet, landing together in the
// one owner-approved merge. Keeping the ledger out of that merge is what left
// M-EVENTS-CALENDAR-TARGET-STATE's ledger dangling until a second pull request
// put it on `main`.

const INTAKE_ARTIFACT_DIRECTORIES = ["missions/intake", "missions/packets"];

/**
 * Check the paths in the final intake pull request's diff.
 * Returns an array of human-readable errors; empty means the diff contains
 * exactly this mission's ledger and packet.
 */
export function validateFinalPrPaths(missionId, paths) {
  const errors = [];
  if (!/^M-[A-Za-z0-9][A-Za-z0-9-]*$/.test(missionId ?? "")) {
    return ["mission id must match M-<slug>."];
  }
  if (!Array.isArray(paths) || paths.length === 0) {
    return ["the final intake pull request must not be empty."];
  }

  const allowed = INTAKE_ARTIFACT_DIRECTORIES.map((directory) => `${directory}/${missionId}/`);
  const seen = new Set();
  for (const file of paths) {
    const normalised = String(file).replace(/^\.\//, "");
    const prefix = allowed.find((candidate) => normalised.startsWith(candidate));
    if (!prefix) {
      errors.push(
        `${normalised} is not an intake artifact: the final pull request carries only ${allowed.join(" and ")}.`,
      );
      continue;
    }
    seen.add(prefix);
  }
  for (const prefix of allowed) {
    if (!seen.has(prefix)) errors.push(`the final pull request must land ${prefix}**.`);
  }
  return errors;
}

export { INTAKE_ARTIFACT_DIRECTORIES };
