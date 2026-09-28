// Run from the repository root: node scripts/analysis/lan-443-benchmark.mjs [baseline-ref]
// Pure functions only: no database, network, credentials, or writes.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import ts from "typescript";

const baseline = process.argv[2] ?? "cd5f8187";
const root = process.cwd();
function loader(ref) {
  const cache = new Map();
  return function load(file) {
    if (cache.has(file)) return cache.get(file);
    const source = ref
      ? execFileSync("git", ["show", `${ref}:${file}`], { encoding: "utf8" })
      : readFileSync(path.join(root, file), "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    const loaded = { exports: {} };
    cache.set(file, loaded.exports);
    const require = (specifier) => {
      const target = specifier.startsWith("@/")
        ? `src/${specifier.slice(2)}`
        : path.join(path.dirname(file), specifier);
      return load(`${target}.ts`);
    };
    new Function("require", "module", "exports", outputText)(require, loaded, loaded.exports);
    return loaded.exports;
  };
}
const before = loader(baseline);
const after = loader(null);
// Hourly samples spanning the leap year and both London clock changes.
const instants = Array.from(
  { length: 366 * 24 },
  (_, hour) => new Date(Date.UTC(2028, 0, 1) + hour * 3_600_000),
);
const days = instants.filter((_, i) => i % 24 === 0).map((date) => date.toISOString().slice(0, 10));
const cases = [
  ["todayInClubZone", "src/lib/club-time.ts", instants],
  ["formatClubDay", "src/lib/club-time.ts", [...days, "", "bad date", "2028-13-45", "2028-02-31"]],
  [
    "eventStartInstant",
    "src/lib/services/attendance-window.ts",
    days.flatMap((scheduledOn) =>
      [null, "00:00", "01:30", "07:00", "22:00"].map((startsAt) => ({ scheduledOn, startsAt })),
    ),
  ],
  ["formatChaseDue", "src/lib/services/chase-position.ts", instants],
  ["isLightsOut", "src/lib/services/messaging-schedule/lights-out.ts", instants],
  ["lightsOutReleaseAt", "src/lib/services/messaging-schedule/lights-out.ts", instants],
];
const iterations = 2000;
function measure(fn, inputs) {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn(inputs[i % inputs.length]);
  return performance.now() - start;
}
const results = [];
for (const [name, file, inputs] of cases) {
  const oldFn = before(file)[name];
  const newFn = after(file)[name];
  for (const input of inputs)
    assert.deepEqual(newFn(input), oldFn(input), `${name}: ${JSON.stringify(input)}`);
  // Warm both paths, alternate measurement order, and report five-run medians.
  measure(oldFn, inputs);
  measure(newFn, inputs);
  const oldTimes = [],
    newTimes = [];
  for (let run = 0; run < 5; run++) {
    for (const [fn, times] of run % 2
      ? [
          [newFn, newTimes],
          [oldFn, oldTimes],
        ]
      : [
          [oldFn, oldTimes],
          [newFn, newTimes],
        ]) {
      times.push(measure(fn, inputs));
    }
  }
  const median = (times) => times.sort((a, b) => a - b)[2];
  const oldMs = median(oldTimes),
    newMs = median(newTimes);
  results.push({
    name,
    equivalentInputs: inputs.length,
    iterations,
    beforeMs: +oldMs.toFixed(2),
    afterMs: +newMs.toFixed(2),
    speedup: +(oldMs / newMs).toFixed(2),
  });
}
console.log(
  JSON.stringify({ baseline, node: process.version, icu: process.versions.icu, results }, null, 2),
);
