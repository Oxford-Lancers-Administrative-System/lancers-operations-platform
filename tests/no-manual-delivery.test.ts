// @vitest-environment node
/**
 * "No screen, code path, fixture or runbook treats manual WhatsApp sending as
 * completion." LAN-78's acceptance criterion, as a test rather than as a
 * promise.
 *
 * ## What this forbids, and what it deliberately does not
 *
 * It forbids an operator being *offered* a way to send an invitation by hand —
 * a copy-link control, a send-message button, a post-to-group action, a
 * mark-as-sent transition — and it forbids any of those being described as a
 * fallback in a document a human follows.
 *
 * It does **not** forbid the word "manual", and it does not forbid
 * `delivery_outcome`'s `manual` value. That value is the frozen model's, it
 * predates this issue, and it records something different and legitimate: that
 * a human contacted somebody, with their name against it. The seeded dataset
 * contains such rows on purpose. Recording that a person did something is not
 * the same as the system offering that as its delivery path, and a test that
 * conflated them would have to be weakened the first time somebody needed the
 * former.
 *
 * The structural half of this guarantee is in the schema, not here:
 * `delivery_attempts_are_never_manual` refuses the channel outright, so an
 * attempt this system makes can never be a manual one whatever any screen says.
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
 * Control labels and action names that would each be a manual send.
 *
 * Written as the words that would appear on a button or in an instruction,
 * because that is what an operator acts on. A comment saying "there is no
 * copy-link control" must not trip them, so every pattern requires the shape of
 * an affordance — a JSX label, a string constant, a Markdown instruction — and
 * the test that proves the patterns still bite is at the bottom.
 */
const FORBIDDEN_AFFORDANCES: readonly { name: string; pattern: RegExp }[] = [
  { name: "a copy-link control", pattern: /\b(copy (the )?(rsvp )?link|copyLink|copy_link)\b/i },
  {
    name: "a send-by-hand control",
    pattern: /\b(send (it )?manually|manual send|sendManually)\b/i,
  },
  {
    name: "a post-to-group control",
    pattern: /\b(post to (the )?group|postToGroup|post_to_group)\b/i,
  },
  { name: "a mark-as-sent transition", pattern: /\b(mark as sent|markAsSent|mark_as_sent)\b/i },
  { name: "a mark-as-delivered transition", pattern: /\b(mark as delivered|markAsDelivered)\b/i },
];

/**
 * Files that may legitimately discuss the ban in English, and so are exempt
 * from the **phrase** rules — and from those only.
 *
 * They are still held to the scheme rules below. Review defeated the phrase
 * rules by putting `https://wa.me/` in `presentation.ts`, which is on this list
 * and was therefore exempt from everything: the scheme rules never read the one
 * file that holds the delivery screens' strings. Explaining a prohibition is a
 * reason to be excused a keyword search. It is not a reason to be excused a URL
 * scheme that has no honest use anywhere in this application.
 */
const EXPLAINS_THE_BAN: readonly string[] = [
  "tests/no-manual-delivery.test.ts",
  "src/app/operate/events/[id]/delivery/presentation.ts",
  "src/app/operate/events/[id]/delivery/actions.ts",
  "src/lib/services/delivery.ts",
  "supabase/migrations/20260813120000_domain_rsvp_delivery.sql",
];

describe("no manual delivery path exists in the application", () => {
  /**
   * Application source only — test files are excluded.
   *
   * Not a relaxation: a test cannot offer a control to an operator, so scanning
   * one never protected anything. What it did do was guarantee a false positive,
   * because a suite that *tests* the ban has to name the thing being banned —
   * `src/app/operate/events/[id]/delivery/screens.test.tsx` pins the repair
   * panel's controls precisely so that "Open in WhatsApp to send this yourself"
   * fails, and it cannot do that without writing the phrase down.
   *
   * The screens themselves are guarded by that inventory rather than by this
   * scan, which is the stronger of the two: it fails for any control added to
   * the panel, however it is worded.
   */
  const sources = filesUnder("src", [".ts", ".tsx"]).filter(
    (file) => !EXPLAINS_THE_BAN.includes(file) && !/\.test\.tsx?$/.test(file),
  );

  it("reads a non-trivial number of source files", () => {
    // A scan that silently stops finding files is how this rule dies.
    expect(sources.length).toBeGreaterThan(40);
    expect(sources.filter((file) => /\.test\.tsx?$/.test(file))).toEqual([]);
  });

  it("still reads the delivery screens themselves", () => {
    // The exclusion above must not have swallowed the files that matter most.
    for (const file of [
      "src/app/operate/events/[id]/delivery/page.tsx",
      "src/app/operate/events/[id]/delivery/repair-forms.tsx",
    ]) {
      expect(sources).toContain(file);
    }
  });

  it.each(FORBIDDEN_AFFORDANCES)("offers nothing resembling $name", ({ pattern }) => {
    const offenders = sources.filter((file) => pattern.test(read(file)));
    expect(offenders).toEqual([]);
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

  it("keeps the refusal in the schema, where no code can talk its way around it", () => {
    const migration = read("supabase/migrations/20260813120000_domain_rsvp_delivery.sql");
    expect(migration).toContain("delivery_attempts_are_never_manual");
    expect(migration).toMatch(/check\s*\(\s*channel\s*<>\s*'manual'\s*\)/);
  });
});

/**
 * Schemes, not phrasings.
 *
 * The affordance list above matches English. Two rounds of review walked past
 * it — first with "Open in WhatsApp to send this invitation yourself", then
 * with "Share invitation" — because there are unbounded ways to word a button
 * and only one way to point it at WhatsApp. These rules match the *mechanism*,
 * which has a small closed vocabulary, and are therefore the half of this file
 * that cannot be out-phrased.
 */
describe("nothing in the application can hand a person off to another app", () => {
  // Every application file, including the ones excused the phrase rules. Only
  // this suite itself is exempt, because it has to write the schemes down.
  const sources = filesUnder("src", [".ts", ".tsx"]).filter((file) => !/\.test\.tsx?$/.test(file));

  it("reads the files the phrase rules excuse", () => {
    // The exemption list is a phrase-rule concession and must not leak here.
    expect(sources).toContain("src/app/operate/events/[id]/delivery/presentation.ts");
    expect(sources).toContain("src/lib/services/delivery.ts");
  });

  const HANDOFF_SCHEMES: readonly { name: string; pattern: RegExp }[] = [
    { name: "a wa.me deep link", pattern: /\bwa\.me\b/i },
    { name: "a whatsapp:// URL", pattern: /whatsapp:\/\//i },
    { name: "the WhatsApp send API", pattern: /api\.whatsapp\.com/i },
    { name: "an sms: link", pattern: /["'`]sms:/i },
    { name: "a tel: link", pattern: /["'`]tel:/i },
    { name: "a mailto: link", pattern: /["'`]mailto:/i },
    { name: "the Web Share API", pattern: /navigator\.share\b/i },
    // Not a scheme, but the same thing by another route: a control that opens
    // or navigates anywhere is a handoff whatever its destination string looks
    // like, and a computed URL defeats every pattern above.
    { name: "a window.open call", pattern: /\bwindow\.open\s*\(/i },
    { name: "a location assignment", pattern: /\blocation\.(assign|replace|href\s*=)/i },
    { name: "a clipboard write", pattern: /navigator\.clipboard/i },
  ];

  it.each(HANDOFF_SCHEMES)("contains nothing resembling $name", ({ pattern }) => {
    expect(sources.filter((file) => pattern.test(read(file)))).toEqual([]);
  });

  it.each([
    ["https://wa.me/447700900123", /\bwa\.me\b/i],
    ['href="whatsapp://send?text=hello"', /whatsapp:\/\//i],
    ["https://api.whatsapp.com/send", /api\.whatsapp\.com/i],
    ['href="sms:+447700900123"', /["'`]sms:/i],
    ['href="tel:+447700900123"', /["'`]tel:/i],
    ['href="mailto:alex@example.invalid"', /["'`]mailto:/i],
    ["await navigator.share({ url })", /navigator\.share\b/i],
    ['window.open(`${BASE}${number}`, "_blank")', /\bwindow\.open\s*\(/i],
    ["location.assign(handoffUrl)", /\blocation\.(assign|replace|href\s*=)/i],
    ["navigator.clipboard.writeText(link)", /navigator\.clipboard/i],
  ])("still recognises %s", (sample, pattern) => {
    // A rule that matches nothing passes whether or not it works.
    expect(pattern.test(sample)).toBe(true);
  });

  it("uses the same patterns it proves", () => {
    for (const sample of [
      "https://wa.me/447700900123",
      'href="whatsapp://send"',
      "https://api.whatsapp.com/send",
      "await navigator.share({ url })",
      'window.open(`${BASE}${number}`, "_blank")',
      "navigator.clipboard.writeText(link)",
    ]) {
      expect(HANDOFF_SCHEMES.some((entry) => entry.pattern.test(sample))).toBe(true);
    }
  });
});

describe("no runbook or fixture presents one as a fallback", () => {
  const documents = [
    ...filesUnder("docs", [".md"]),
    ...filesUnder("scripts/pilot", [".md", ".sql"]),
  ].filter((file) => !EXPLAINS_THE_BAN.includes(file));

  it("reads a non-trivial number of documents", () => {
    expect(documents.length).toBeGreaterThan(15);
  });

  /**
   * Documents permitted to name a manual affordance, because prohibiting it is
   * their subject.
   *
   * An allowlist, not a heuristic. This was "is there a negating word within
   * 220 characters?", and `\bno` matches "Note", "nothing" and "November" — so
   * an instruction reading "Copy link from the repair panel and paste it into
   * the club WhatsApp group. Note the time you did so." passed, in a runbook
   * Brian follows by hand against the one production database. Proximity to a
   * negation is not evidence of anything; being one of the documents that
   * define the rule is.
   *
   * The pilot README is deliberately **not** here. It now describes the absence
   * of these controls without naming them, which is both safer and better copy.
   */
  const DEFINES_THE_PROHIBITION: readonly string[] = [
    // The locked requirement itself: "An agent may never implement a manual
    // path, offer it as an interim step, let a 'mark as sent' action stand in
    // for delivery…". Naming the thing is the whole content of the rule.
    "docs/adr/0013-supervised-agent-development.md",
    "docs/adr/0023-rsvp-token-and-whatsapp-delivery.md",
    "docs/ux/slice-ux.md",
    "docs/ux/tickets/LAN-78-delivery.md",
    // Records that LAN-78's UX was validated as having no such action.
    "docs/ux/review/validation-report.md",
    "docs/ux/review/lan-78/README.md",
  ];

  it("allows only documents it actually scans", () => {
    for (const file of DEFINES_THE_PROHIBITION) {
      expect(documents, `${file} is allowed but not scanned`).toContain(file);
    }
  });

  it.each(FORBIDDEN_AFFORDANCES)("instructs nobody to use $name", ({ pattern }) => {
    const offenders = documents.filter(
      (file) => !DEFINES_THE_PROHIBITION.includes(file) && pattern.test(read(file)),
    );
    expect(offenders).toEqual([]);
  });

  it("states the ban where an implementer reads it", () => {
    expect(read("docs/ux/slice-ux.md")).toMatch(/no manual send or post control/i);
    expect(read("docs/ux/tickets/LAN-78-delivery.md")).toMatch(
      /Manual copying, sending or posting/i,
    );
  });
});

describe("the rules can still see a violation", () => {
  /**
   * Defect injection, because a scan that matches nothing passes whether or not
   * it works. Each pattern is run against text that should trip it — if one
   * stops biting, this fails rather than the suite going quietly green.
   */
  it.each([
    ["Copy link", /\b(copy (the )?(rsvp )?link|copyLink|copy_link)\b/i],
    ["send manually", /\b(send (it )?manually|manual send|sendManually)\b/i],
    ["Post to group", /\b(post to (the )?group|postToGroup|post_to_group)\b/i],
    ["Mark as sent", /\b(mark as sent|markAsSent|mark_as_sent)\b/i],
    ["markAsDelivered", /\b(mark as delivered|markAsDelivered)\b/i],
  ])("still recognises %s", (sample, pattern) => {
    expect(pattern.test(sample)).toBe(true);
  });

  it("uses the same patterns it proves, rather than a copy that can drift", () => {
    // Two lists would be one edit away from disagreeing, so the injected
    // samples above must each be matched by a real entry in the live list.
    for (const sample of [
      "Copy link",
      "send manually",
      "Post to group",
      "Mark as sent",
      "markAsDelivered",
    ]) {
      expect(FORBIDDEN_AFFORDANCES.some((entry) => entry.pattern.test(sample))).toBe(true);
    }
  });
});
