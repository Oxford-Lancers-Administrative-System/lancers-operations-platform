// @vitest-environment node
/**
 * "No screen, code path, fixture or runbook treats manual WhatsApp sending as
 * completion." LAN-78's acceptance criterion, as a test rather than as a
 * promise.
 *
 * ## What this is, and what it deliberately is not
 *
 * It is a **scope** guarantee, not a security boundary. Nothing in LAN-78, in
 * `docs/ux/slice-ux.md` or in `AGENTS.md` says an operator is *prevented* from
 * pasting a link into WhatsApp — of course they can, and no software could stop
 * them. What every source actually says is narrower and checkable: we do not
 * build that feature, the delivery screens do not offer that control, and
 * nothing counts a hand-sent message as the job being done.
 *
 * This file previously tried to enforce the wider reading — a scheme scan over
 * every application file, a ban on absolute URLs in the delivery sources, a
 * control inventory reaching pages that are not delivery screens. That is an
 * anti-tamper regime for an invariant nobody stated, it cost six rounds of
 * review to no benefit, and it is gone.
 *
 * The three checks that remain each trace to a specific sentence:
 *
 * - the **schema** refuses a manual channel on an attempt this system makes;
 * - the **service** neither exports a function that would perform one nor
 *   writes a manual channel or outcome;
 * - no **runbook** tells a human to send by hand as a step.
 *
 * The screens are covered where screens are covered: the control inventory in
 * `src/app/operate/events/[id]/delivery/screens.test.tsx`, as ordinary UX
 * conformance against the approved wireframes.
 *
 * It does **not** forbid the word "manual", and it does not forbid
 * `delivery_outcome`'s `manual` value. That value is the frozen model's, it
 * predates this issue, and it records something different and legitimate: that
 * a human contacted somebody, with their name against it. The seeded dataset
 * contains such rows on purpose. Recording that a person did something is not
 * the same as the system offering that as its delivery path.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");

function filesUnder(directory: string, extensions: readonly string[]): string[] {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return [];

  const found: string[] = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...filesUnder(relative, extensions));
    else if (extensions.some((extension) => entry.name.endsWith(extension))) found.push(relative);
  }
  return found;
}

const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

/**
 * Instructions that would each make a hand-sent message the completion of a
 * delivery, written as the words a human would read and act on.
 */
const FORBIDDEN_INSTRUCTIONS: readonly { name: string; pattern: RegExp }[] = [
  { name: "a copy-link step", pattern: /\b(copy (the )?(rsvp )?link|copyLink|copy_link)\b/i },
  { name: "a send-by-hand step", pattern: /\b(send (it )?manually|manual send|sendManually)\b/i },
  {
    name: "a post-to-group step",
    pattern: /\b(post to (the )?group|postToGroup|post_to_group)\b/i,
  },
  { name: "a mark-as-sent transition", pattern: /\b(mark as sent|markAsSent|mark_as_sent)\b/i },
  { name: "a mark-as-delivered transition", pattern: /\b(mark as delivered|markAsDelivered)\b/i },
];

describe("the delivery path this system takes is never a manual one", () => {
  it("keeps the refusal in the schema, where no code can talk its way around it", () => {
    const migration = read("supabase/migrations/20260813120000_domain_rsvp_delivery.sql");
    expect(migration).toContain("delivery_attempts_are_never_manual");
    expect(migration).toMatch(/check\s*\(\s*channel\s*<>\s*'manual'\s*\)/);
  });

  it("exports no service function that would perform one", () => {
    const delivery = read("src/lib/services/delivery.ts");
    const exported = [...delivery.matchAll(/export async function (\w+)/g)].map(
      (match) => match[1],
    );

    expect(exported.length).toBeGreaterThan(3);
    for (const name of exported) {
      expect(name).not.toMatch(/manual|copy|markSent|markDelivered/i);
    }
  });

  it("never writes a manual channel or a manual outcome", () => {
    // The service records `delivered`, `failed` and `rejected`, and nothing else.
    const delivery = read("src/lib/services/delivery.ts");
    expect(delivery).not.toMatch(/'manual'/);
    expect(delivery).not.toMatch(/"manual"/);
  });
});

describe("no runbook presents a hand-sent message as a completed delivery", () => {
  const documents = [...filesUnder("docs", [".md"]), ...filesUnder("scripts/pilot", [".md"])];

  it("reads a non-trivial number of documents", () => {
    expect(documents.length).toBeGreaterThan(15);
  });

  /**
   * Documents permitted to name a manual step, because prohibiting it is their
   * subject.
   *
   * An allowlist, not a heuristic. This was once "is there a negating word
   * within 220 characters?", and `\bno` matches "Note" — so an instruction
   * reading "Copy link from the repair panel and paste it into the club
   * WhatsApp group. Note the time you did so." passed, in a runbook Brian
   * follows by hand against the one production database.
   */
  const DEFINES_THE_PROHIBITION: readonly string[] = [
    "docs/adr/0013-supervised-agent-development.md",
    "docs/adr/0023-rsvp-token-and-whatsapp-delivery.md",
    "docs/ux/slice-ux.md",
    "docs/ux/tickets/LAN-78-delivery.md",
    "docs/ux/review/validation-report.md",
    "docs/ux/review/lan-78/README.md",
  ];

  it("allows only documents it actually scans", () => {
    for (const file of DEFINES_THE_PROHIBITION) {
      expect(documents, `${file} is allowed but not scanned`).toContain(file);
    }
  });

  it.each(FORBIDDEN_INSTRUCTIONS)("instructs nobody to use $name", ({ pattern }) => {
    const offenders = documents.filter(
      (file) => !DEFINES_THE_PROHIBITION.includes(file) && pattern.test(read(file)),
    );
    expect(offenders).toEqual([]);
  });

  it("states the scope decision where an implementer reads it", () => {
    expect(read("docs/ux/slice-ux.md")).toMatch(/no manual send or post control/i);
    expect(read("docs/ux/tickets/LAN-78-delivery.md")).toMatch(
      /Manual copying, sending or posting/i,
    );
  });
});

describe("the rules can still see a violation", () => {
  /**
   * Defect injection, because a scan that matches nothing passes whether or not
   * it works.
   */
  it.each([
    ["Copy link", "copy-link"],
    ["send manually", "send-by-hand"],
    ["Post to group", "post-to-group"],
    ["Mark as sent", "mark-as-sent"],
    ["markAsDelivered", "mark-as-delivered"],
  ])("still recognises %s", (sample) => {
    // Matched against the live list, so the samples and the rules cannot drift
    // apart the way two copies would.
    expect(FORBIDDEN_INSTRUCTIONS.some((entry) => entry.pattern.test(sample))).toBe(true);
  });
});
