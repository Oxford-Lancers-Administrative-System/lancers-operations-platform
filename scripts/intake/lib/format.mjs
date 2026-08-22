// Prettier, resolved from this repository rather than from the caller's working
// directory, so a generated ledger artifact is formatted identically whether it
// is written from a worktree, from a test's temporary directory, or in CI.

import path from "node:path";
import prettier from "prettier";

const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");

const PARSERS = {
  ".html": "html",
  ".md": "markdown",
  ".json": "json",
  ".mjs": "babel",
  ".js": "babel",
  ".ts": "typescript",
};

let cached;

async function options() {
  cached ??= (await prettier.resolveConfig(path.join(repoRoot, "package.json"))) ?? {};
  return cached;
}

/** Format `content` the way `npm run format` would format a file of this type. */
export async function formatAs(content, file) {
  const parser = PARSERS[path.extname(file).toLowerCase()];
  if (!parser) return content;
  return prettier.format(content, { ...(await options()), parser });
}
