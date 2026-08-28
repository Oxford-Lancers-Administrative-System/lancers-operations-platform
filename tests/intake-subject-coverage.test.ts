import { describe, expect, it } from "vitest";
import {
  renderSubjectCoverage,
  validateAmendmentPlan,
  validateSubjectCoverage,
} from "../scripts/intake/lib/subject.mjs";
import { validateIntakeState } from "../scripts/intake/lib/state.mjs";
import {
  syntheticDecisionCoverage,
  syntheticSubjectCoverage,
} from "./helpers/synthetic-intake-ledger";

const missionId = "M-SYNTHETIC-INTAKE";
const workflowIds = ["W1"];
const coverage = () => structuredClone(syntheticSubjectCoverage(missionId));
const errorsFor = (mutate: (draft: ReturnType<typeof coverage>) => void) => {
  const draft = coverage();
  mutate(draft);
  return validateSubjectCoverage(draft, { workflowIds, missionId }).join("\n");
};

describe("subject-product coverage", () => {
  it("accepts a mixed, fully disposed subject map", () => {
    expect(validateSubjectCoverage(coverage(), { workflowIds, missionId })).toEqual([]);
  });

  it("refuses owned areas that do not map to a workflow or invariant", () => {
    expect(
      errorsFor((draft) => {
        delete draft.areas[0].workflow;
        delete draft.areas[1].invariant;
      }),
    ).toMatch(
      /owned_workflow and must name one frozen workflow[\s\S]*must state the binding invariant/,
    );

    expect(
      errorsFor((draft) => {
        draft.areas[2].workflow = "W9";
        draft.areas[3].baseline = "";
      }),
    ).toMatch(/retained_existing and must map[\s\S]*must cite the implemented main baseline/);
  });

  it("refuses ownerless or unsupported seams and exclusions", () => {
    expect(
      errorsFor((draft) => {
        draft.areas[4].shared_owners = [missionId];
        delete draft.areas[4].current_side;
        delete draft.areas[4].workflow;
        draft.areas[5].other_mission = missionId;
        delete draft.areas[5].seam;
        delete draft.areas[7].approval;
      }),
    ).toMatch(
      /shared_owners must name at least 2 missions[\s\S]*must state this mission's side[\s\S]*must map this mission's side[\s\S]*must name a different owning mission[\s\S]*must record the other-mission seam[\s\S]*requires evidence plus Brian's words and date/,
    );
  });

  it("refuses unresolved, blocking, and unexplained provisional handoffs", () => {
    expect(
      errorsFor((draft) => {
        draft.areas[6].blocking = true;
      }),
    ).toMatch(/blocking provisional handoff/);
    expect(
      errorsFor((draft) => {
        delete draft.areas[6].independent_outcome;
      }),
    ).toMatch(/nonblocking only when independent_outcome explains/);
    expect(
      errorsFor((draft) => {
        draft.areas[6].disposition = "unresolved";
      }),
    ).toMatch(/is unresolved; settle or route it before freezing workflows/);
  });

  it("renders the subject map and collected amendment plan from state alone", () => {
    const state = {
      mission_id: missionId,
      subject_coverage: coverage(),
      amendment_plan: {
        items: [
          {
            id: "A1",
            target: "M-FUTURE-SYNTHETIC portfolio row",
            change: "Append the dated extension.",
            reason: "The seam was discovered here.",
            status: "proposed",
          },
        ],
        approval: null,
      },
    };
    const rendered = renderSubjectCoverage(state);
    expect(rendered).toContain("# Subject-product coverage — M-SYNTHETIC-INTAKE");
    expect(rendered).toContain("| `S1` | Review the synthetic outcome | `owned_workflow` | W1 |");
    expect(rendered).toContain("## Batched append-only amendment plan");
    expect(rendered).toContain("Collected-plan approval — not yet requested.");
    expect(renderSubjectCoverage(state)).toBe(rendered);
  });

  it("keeps owner-written table text inside its generated cells", () => {
    const state = {
      mission_id: missionId,
      subject_coverage: coverage(),
      amendment_plan: {
        items: [
          {
            id: "A1",
            target: "Mission | requirement",
            change: "Append line one\nand line two.",
            reason: "The seam was discovered here.",
            status: "proposed",
          },
        ],
        approval: null,
      },
    };
    state.subject_coverage.areas[0].name = "Review | accept";
    const rendered = renderSubjectCoverage(state);
    expect(rendered).toContain("Review \\| accept");
    expect(rendered).toContain("Mission \\| requirement");
    expect(rendered).toContain("Append line one and line two.");
  });
});

describe("the collected append-only amendment plan", () => {
  const applied = () => ({
    items: [
      {
        id: "A1",
        target: "M-FUTURE-SYNTHETIC portfolio row",
        change: "Append the dated extension.",
        reason: "The seam was discovered here.",
        status: "applied_verified",
        verification: {
          refetched_at: "2026-08-28T19:00:00Z",
          evidence: "Refetched target contains the approved dated note.",
        },
      },
    ],
    approval: { words: "Apply this collected amendment plan.", date: "2026-08-28" },
  });

  it("accepts an approved, refetched applied batch", () => {
    expect(validateAmendmentPlan(applied())).toEqual([]);
  });

  it("refuses applied edits without collected approval or refetch proof", () => {
    const unapproved = applied();
    unapproved.approval = null as never;
    delete (unapproved.items[0] as { verification?: unknown }).verification;
    expect(validateAmendmentPlan(unapproved).join("\n")).toMatch(
      /must record refetched_at[\s\S]*without Brian's approval of the collected plan/,
    );
  });
});

describe("the version 3 workflow-stage gate", () => {
  const state = () => ({
    mission_id: missionId,
    ledger_version: 3,
    stage: "workflows",
    baseline: { branch: "main", commit: "315fbbbcdff2da3a5b6ead2d4352785bb12943be" },
    approvals: {
      boundary: { words: "Approve the whole subject boundary.", date: "2026-08-28" },
      overview: { words: "Approve the overview.", date: "2026-08-28" },
      inventory: { words: "Approve the workflow inventory.", date: "2026-08-28" },
    },
    workflows: [
      {
        id: "W1",
        name: "Review synthetic outcome",
        state: "spec_draft",
        stale: false,
        feedback: [],
      },
    ],
    mockup_hub: { not_applicable: "This synthetic mission draws no mockups." },
    decision_coverage: syntheticDecisionCoverage(missionId),
    subject_coverage: coverage(),
    amendment_plan: { items: [], approval: null },
    next_action: "Draft W1",
  });

  it("requires subject coverage and an amendment record before workflows", () => {
    expect(validateIntakeState(state())).toEqual([]);
    const missingCoverage = state() as Record<string, unknown>;
    delete missingCoverage.subject_coverage;
    expect(validateIntakeState(missingCoverage).join("\n")).toMatch(
      /subject_coverage is required before the workflow stage/,
    );
    const missingPlan = state() as Record<string, unknown>;
    delete missingPlan.amendment_plan;
    expect(validateIntakeState(missingPlan).join("\n")).toMatch(/amendment_plan must be an object/);
  });

  it("keeps existing live version 2 ledgers on their original contract", () => {
    const prior = state() as Record<string, unknown>;
    prior.ledger_version = 2;
    delete prior.subject_coverage;
    delete prior.amendment_plan;
    expect(validateIntakeState(prior)).toEqual([]);
  });
});
