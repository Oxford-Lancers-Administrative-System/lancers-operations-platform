// @vitest-environment node
/**
 * Every sending path reaches the guard — LAN-394.
 *
 * ## Why a source test and not only a behavioural one
 *
 * There are seven dispatchers and there will one day be an eighth. A
 * behavioural test proves that the seven that exist today are guarded; this
 * proves that a new one cannot be added without either calling the guard or
 * failing this file. The design's first finding was "seven egress sites, not
 * one", and the way that becomes eight without anybody noticing is a copied
 * dispatcher.
 *
 * It is deliberately narrow: a list of the functions that may call a provider,
 * and a check that each one's body reaches `admitSendIn` before it does. It is
 * not a general security scanner, and it does not try to understand the code —
 * `tests/messaging-safety.test.ts` and `src/lib/services/messaging-safety.test.ts`
 * are where the behaviour is proved.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");

function source(relative: string): string {
  return readFileSync(join(ROOT, relative), "utf8");
}

/**
 * The bodies of the named top-level functions, keyed by name.
 *
 * Brace matching from the declaration, which is enough for this file's
 * purpose: these are all `export async function name(` or
 * `async function name(` at column zero, and every one of them is balanced.
 */
function functionBodies(text: string): Map<string, string> {
  const bodies = new Map<string, string>();
  const declaration = /^(?:export )?async function ([A-Za-z0-9_]+)\(/gm;
  for (const match of text.matchAll(declaration)) {
    // The parameter list first — a default like `options: {…} = {}` puts braces
    // in it, and starting the body scan at the first brace after the name would
    // read that instead of the function.
    let depth = 0;
    let cursor = match.index + match[0].length - 1;
    for (; cursor < text.length; cursor += 1) {
      if (text[cursor] === "(") depth += 1;
      else if (text[cursor] === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const start = text.indexOf("{", cursor);
    if (start === -1) continue;
    depth = 0;
    let end = start;
    for (let i = start; i < text.length; i += 1) {
      if (text[i] === "{") depth += 1;
      else if (text[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    bodies.set(match[1], text.slice(start, end + 1));
  }
  return bodies;
}

/** Every function in the application that may hand a message to a provider. */
const DISPATCHERS: readonly { file: string; fn: string }[] = [
  { file: "src/lib/services/delivery.ts", fn: "claimJobIn" },
  { file: "src/lib/services/messaging-scheduler.ts", fn: "dispatchEscalationJob" },
  { file: "src/lib/services/messaging-scheduler.ts", fn: "dispatchRecruitmentCycleJob" },
  { file: "src/lib/services/messaging-scheduler.ts", fn: "dispatchOnboardingWelcomeJob" },
  { file: "src/lib/services/messaging-scheduler.ts", fn: "dispatchOnboardingChaseJob" },
  { file: "src/lib/services/messaging-scheduler.ts", fn: "dispatchOnboardingChaseEscalationJob" },
  { file: "src/lib/services/messaging-scheduler.ts", fn: "dispatchNoticeJob" },
];

describe("every sending path reaches the messaging safety guard", () => {
  const cache = new Map<string, Map<string, string>>();
  function bodyOf(file: string, fn: string): string {
    if (!cache.has(file)) cache.set(file, functionBodies(source(file)));
    const body = cache.get(file)?.get(fn);
    expect(body, `${fn} was not found in ${file}`).toBeTruthy();
    return body as string;
  }

  it.each(DISPATCHERS)("$fn calls admitSendIn", ({ file, fn }) => {
    expect(bodyOf(file, fn)).toContain("admitSendIn(");
  });

  it.each(DISPATCHERS)("$fn lets the guard decide whether the attempt is spent", ({ file, fn }) => {
    const body = bodyOf(file, fn);
    const admit = body.indexOf("admitSendIn(");

    // Everything that spends an attempt — `claiming.take()` in the scheduler,
    // `claimNow()` in delivery.ts — has to be reachable only through the
    // guard's own answer. The cheapest true statement of that is that the
    // guard's result is read, and read before the send path continues.
    expect(body.slice(admit)).toContain("admission.admitted");
    expect(body.slice(admit)).toContain("recordWaitingIn(");
  });

  it("no dispatcher writes a safety deferral into last_error", () => {
    for (const { file, fn } of DISPATCHERS) {
      const body = bodyOf(file, fn);
      const admit = body.indexOf("admitSendIn(");
      const deferralBranch = body.slice(admit, body.indexOf("}", body.indexOf("recordWaitingIn")));
      expect(deferralBranch, `${fn} touches last_error on a deferral`).not.toContain("last_error");
    }
  });

  it("only the adapters classify a provider fault", () => {
    // The circuit must never be driven by reading a human sentence. Only the
    // two adapters may set `faultScope`, and only the settlement module may
    // read it.
    const settlement = source("src/lib/services/messaging-safety/settlement.ts");
    expect(settlement).toContain('outcome.faultScope !== "provider"');
    for (const file of [
      "src/lib/services/delivery.ts",
      "src/lib/services/messaging-scheduler.ts",
    ]) {
      expect(source(file)).not.toContain("faultScope");
    }
  });
});
