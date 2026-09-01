/**
 * Path matching for the merge rule.
 *
 * Relocated verbatim from the deleted `scripts/fast-lane/classify.mjs` (LAN-209).
 * The eligibility classifier that surrounded them is gone — there are no lanes
 * and no classes any more — but the two primitives it was built on are exactly
 * what the one surviving rule needs: turn a checked-in glob into a regular
 * expression, and read `git diff --name-status` into structured entries.
 */

/**
 * A checked-in glob as an anchored regular expression.
 *
 * `**` crossing directory separators is handled explicitly rather than by
 * translating it to `.*` and hoping: `docs/**` must match `docs/a/b.md` and
 * `docs` itself, and `**\/*.md` must match a file at the root.
 */
export function globToRegExp(glob) {
  let source = "";
  for (let i = 0; i < glob.length; i += 1) {
    const rest = glob.slice(i);
    if (rest.startsWith("/**/")) {
      source += "/(?:.*/)?";
      i += 3;
    } else if (rest.startsWith("**/") && i === 0) {
      source += "(?:.*/)?";
      i += 2;
    } else if (rest === "/**") {
      source += "(?:/.*)?";
      i += 2;
    } else if (rest.startsWith("**")) {
      source += ".*";
      i += 1;
    } else if (glob[i] === "*") {
      source += "[^/]*";
    } else if (glob[i] === "?") {
      source += "[^/]";
    } else {
      source += glob[i].replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

/**
 * `git diff --name-status` as structured entries.
 *
 * A rename or copy carries both names, and both are judged: moving a protected
 * file out of its protected path is not a way to stop it being protected.
 */
export function parseNameStatus(text) {
  const files = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const status = parts[0].trim();
    if (/^[RC]/.test(status) && parts.length >= 3) {
      files.push({ status: status[0], path: parts[2], previousPath: parts[1] });
    } else if (parts.length >= 2) {
      files.push({ status: status[0], path: parts[1] });
    }
  }
  return files;
}
