/**
 * The playbook's shape — LAN-399.
 *
 * Every page is the same four bands in the same order: the flowchart, the
 * steps, the rules, and where to look. That is a decision about the reader, not
 * a convenience for the renderer: an operator who has read one page knows where
 * the answer is on the other seven.
 *
 * The copy is **data**, as `../content.ts` is, for the same reason: a
 * prohibition is only real if something checks it. `content.test.ts` walks
 * these structures and fails a page that is missing a band, and — the assertion
 * that earns the type below — fails a page that quotes a screen name or a
 * control label which does not exist in `src/`.
 */

/**
 * A run of guide text.
 *
 * The three object forms are not styling. They are claims about the
 * application, and each one is checked:
 *
 *   * `screen` — a page or section title the reader will see;
 *   * `control` — a button, field, tab or menu label the reader will click;
 *   * `state` — a status value the reader will read off a record.
 *
 * `content.test.ts` asserts every one of them appears verbatim in the
 * application's own source. A paraphrase sends the reader hunting for a control
 * that is not there, which is the single way a guide like this goes wrong.
 */
export type GuideRun =
  string | { readonly screen: string } | { readonly control: string } | { readonly state: string };

/** One numbered step: what the operator does, and what the app does next. */
interface PlaybookStep {
  /** The operator's move. Never in the first person, never "you should". */
  readonly operator: readonly GuideRun[];
  /** What the app does between this step and the next: a message, a state change, a notification. */
  readonly then?: readonly GuideRun[];
}

/** A short labelled fact. The label is the rule; the fact is what it costs. */
interface PlaybookRule {
  readonly label: string;
  readonly fact: readonly GuideRun[];
}

/** Where the reader goes when the flow has not done what they expected. */
interface PlaybookLookup {
  readonly href: string;
  readonly label: string;
  readonly shows: readonly GuideRun[];
}

/** The committed drawing, and the two readings of it that do not depend on sight. */
interface PlaybookFlowchart {
  /** `public/guide/<slug>.svg`, served from the application's own origin. */
  readonly src: string;
  /** The `alt` attribute: what the drawing is, in one line. */
  readonly alt: string;
  /** The drawing in words, beneath it, for a reader who cannot see it and for one who would rather read. */
  readonly description: readonly (readonly GuideRun[])[];
}

export interface PlaybookPage {
  /** The URL segment under `/operate/admin/guide/`. */
  readonly slug: string;
  /** The workflow's name, as the club says it. */
  readonly name: string;
  /** One line on the index. Labels and facts, not a pitch. */
  readonly summary: string;
  readonly flowchart: PlaybookFlowchart;
  readonly steps: readonly PlaybookStep[];
  readonly rules: readonly PlaybookRule[];
  readonly whereToLook: readonly PlaybookLookup[];
}

/** Flattens a run list to plain text, for assertions and for the index. */
export function runsToText(runs: readonly GuideRun[]): string {
  return runs
    .map((run) => {
      if (typeof run === "string") return run;
      if ("screen" in run) return run.screen;
      if ("control" in run) return run.control;
      return run.state;
    })
    .join("");
}

/** Every quoted claim on a page, so a test can check each one against `src/`. */
export function quotedClaims(
  page: PlaybookPage,
): readonly { readonly kind: "screen" | "control" | "state"; readonly text: string }[] {
  const claims: { kind: "screen" | "control" | "state"; text: string }[] = [];

  const walk = (runs: readonly GuideRun[]) => {
    for (const run of runs) {
      if (typeof run === "string") continue;
      if ("screen" in run) claims.push({ kind: "screen", text: run.screen });
      else if ("control" in run) claims.push({ kind: "control", text: run.control });
      else claims.push({ kind: "state", text: run.state });
    }
  };

  for (const line of page.flowchart.description) walk(line);
  for (const step of page.steps) {
    walk(step.operator);
    if (step.then) walk(step.then);
  }
  for (const rule of page.rules) walk(rule.fact);
  for (const lookup of page.whereToLook) walk(lookup.shows);

  return claims;
}
