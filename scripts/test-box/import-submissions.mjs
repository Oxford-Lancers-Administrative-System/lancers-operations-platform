import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export function importSubmissions(files, directory = path.resolve(".lancers-runtime")) {
  if (!files.length) throw new Error("Provide the owner’s template submission JSON files.");
  const byName = new Map();
  for (const file of files) {
    const records = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(records))
      throw new Error("Submission files must contain arrays of template records.");
    for (const record of records) {
      if (record.hold || record.environment === "Production") continue;
      if (
        typeof record.name !== "string" ||
        !record.name.endsWith("_test") ||
        typeof record.kind !== "string" ||
        typeof record.body !== "string" ||
        !Array.isArray(record.samples) ||
        !Array.isArray(record.buttons)
      )
        throw new Error("A test submission record is incomplete.");
      // Later corrected records supersede earlier copies by the exact test name.
      byName.set(record.name, {
        name: record.name,
        kind: record.kind,
        body: record.body,
        samples: record.samples.map((s) => ({ meaning: s.meaning })),
        buttons: record.buttons.map((b) => ({ label: b.label, url: b.url })),
      });
    }
  }
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    path.join(directory, "template-submissions.json"),
    JSON.stringify({
      source: "Owner-supplied LAN-220 submission records",
      approvalVerified: false,
      templates: [...byName.values()],
    }),
    { mode: 0o600 },
  );
  return byName.size;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(
      `Loaded ${importSubmissions(process.argv.slice(2))} test template records. Meta approval is not inferred.`,
    );
  } catch {
    console.error("Template import failed. Check the supplied submission files.");
    process.exitCode = 1;
  }
}
