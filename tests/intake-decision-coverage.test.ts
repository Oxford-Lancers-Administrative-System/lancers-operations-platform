import { describe, expect, it } from "vitest";
import {
  DECISION_DISPOSITIONS,
  renderDecisionCoverage,
  validateDecisionCoverage,
} from "../scripts/intake/lib/decisions.mjs";
import { validateIntakeState } from "../scripts/intake/lib/state.mjs";

const missionId = "M-SYNTHETIC-INTAKE";
const workflowIds = ["W1", "W2"];

type Approval = { words: string; date: string };

type Decision = {
  id: string;
  source_id?: string;
  disposition: string;
  workflow?: string;
  also_referenced_by?: string[];
  reason?: string;
  evidence?: string;
  other_mission?: string;
  shared_owners?: string[];
  superseded_by?: string;
  approval?: Approval;
};

type Coverage = {
  sources: { id: string; ref: string; version: string; decision_ids: string[] }[];
  decisions: Decision[];
};

/**
 * D1–D5 exercise five of the six dispositions; D6 is both the superseding
 * decision that makes D5's supersession real and the sixth disposition. Every
 * mapping is source-scoped.
 */
const coverage = (): Coverage => ({
  sources: [
    {
      id: "SRC-brief",
      ref: "https://example.invalid/synthetic-brief",
      version: "2026-08-22",
      decision_ids: ["D1", "D2", "D3", "D4", "D5", "D6"],
    },
  ],
  decisions: [
    {
      id: "D1",
      source_id: "SRC-brief",
      disposition: "workflow",
      workflow: "W1",
      reason: "W1 is the only journey that reaches this surface.",
      also_referenced_by: ["W2"],
    },
    {
      id: "D2",
      source_id: "SRC-brief",
      disposition: "excluded",
      reason: "The brief excludes it from this mission's boundary.",
      evidence: "§2 'out of scope for this mission'.",
    },
    {
      id: "D3",
      source_id: "SRC-brief",
      disposition: "delegated_to_mission_lead",
      reason: "A reversible implementation choice that cannot change product intent.",
      evidence: "§4 leaves the mechanism unspecified.",
    },
    {
      id: "D4",
      source_id: "SRC-brief",
      disposition: "other_mission",
      other_mission: "M-OTHER-SYNTHETIC",
      reason: "The approved seam puts delivery in the other mission.",
      evidence: "§6 handoff table.",
    },
    {
      id: "D5",
      source_id: "SRC-brief",
      disposition: "superseded",
      superseded_by: "D6",
      reason: "Replaced by the later decision Brian approved.",
      approval: { words: "Yes, D6 replaces D5.", date: "2026-08-22" },
    },
    {
      id: "D6",
      source_id: "SRC-brief",
      disposition: "shared_cross_mission",
      shared_owners: [missionId, "M-OTHER-SYNTHETIC"],
      reason: "Both missions read and honour the same vocabulary.",
      evidence: "§7 shared dependency.",
    },
  ],
});

const errorsFor = (mutate: (draft: Coverage) => void) => {
  const draft = coverage();
  mutate(draft);
  return validateDecisionCoverage(draft, { workflowIds, missionId }).join("\n");
};

const twoSources = (): Coverage => {
  const draft = coverage();
  draft.sources.push({
    id: "SRC-second",
    ref: "https://example.invalid/second",
    version: "2026-08-22",
    decision_ids: ["D1"],
  });
  draft.decisions.push({
    id: "D1",
    source_id: "SRC-second",
    disposition: "workflow",
    workflow: "W2",
    reason: "The second source's D1 is a different decision.",
  });
  return draft;
};

describe("controlling-decision coverage", () => {
  it("accepts one authoritative disposition per decision, across all six dispositions", () => {
    expect(validateDecisionCoverage(coverage(), { workflowIds, missionId })).toEqual([]);
    const used = coverage().decisions.map((decision) => decision.disposition);
    expect([...new Set(used)].sort()).toEqual([...DECISION_DISPOSITIONS].sort());
  });

  it("fails on an unmapped decision", () => {
    expect(
      errorsFor((draft) => {
        draft.sources[0].decision_ids.push("D7");
      }),
    ).toMatch(/D7 \(SRC-brief\) is an unmapped decision/);
  });

  it("fails on duplicate authoritative homes", () => {
    expect(
      errorsFor((draft) => {
        draft.decisions.push({ ...draft.decisions[0], workflow: "W2" });
      }),
    ).toMatch(/D1 \(SRC-brief\) has duplicate authoritative homes/);
  });

  it("lets another workflow reference a decision without becoming its owner", () => {
    expect(validateDecisionCoverage(coverage(), { workflowIds, missionId })).toEqual([]);
    expect(
      errorsFor((draft) => {
        draft.decisions[0].also_referenced_by = ["W1"];
      }),
    ).toMatch(/lists its owning workflow W1 as an additional reference/);
  });

  it("fails on an unknown workflow", () => {
    expect(
      errorsFor((draft) => {
        draft.decisions[0].workflow = "W9";
      }),
    ).toMatch(/D1 \(SRC-brief\) names unknown workflow W9/);
  });

  it("fails on a source-less ambiguous decision ID", () => {
    // Two sources may each declare their own D1, as long as every mapping and
    // every cross-reference says which source it means.
    expect(validateDecisionCoverage(twoSources(), { workflowIds, missionId })).toEqual([]);

    const unscoped = twoSources();
    delete unscoped.decisions[6].source_id;
    expect(validateDecisionCoverage(unscoped, { workflowIds, missionId }).join("\n")).toMatch(
      /D1 is a source-less ambiguous decision ID/,
    );

    const bareReference = twoSources();
    bareReference.decisions[4].superseded_by = "D1";
    expect(validateDecisionCoverage(bareReference, { workflowIds, missionId }).join("\n")).toMatch(
      /superseded_by D1 is a source-less ambiguous decision ID/,
    );

    const qualified = twoSources();
    qualified.decisions[4].superseded_by = "SRC-second:D1";
    expect(validateDecisionCoverage(qualified, { workflowIds, missionId })).toEqual([]);
  });

  it("fails on unsupported exclusion, delegation, other-mission and shared classifications", () => {
    expect(
      errorsFor((draft) => {
        delete draft.decisions[1].evidence;
      }),
    ).toMatch(/unsupported excluded classification/);
    expect(
      errorsFor((draft) => {
        delete draft.decisions[2].evidence;
      }),
    ).toMatch(/unsupported delegated_to_mission_lead classification/);
    expect(
      errorsFor((draft) => {
        draft.decisions[3].other_mission = "not-a-mission";
      }),
    ).toMatch(/unsupported other_mission classification/);
    expect(
      errorsFor((draft) => {
        draft.decisions[5].shared_owners = [missionId];
      }),
    ).toMatch(/unsupported shared_cross_mission classification/);
    expect(
      errorsFor((draft) => {
        draft.decisions[5].shared_owners = ["M-OTHER-SYNTHETIC", "M-THIRD-SYNTHETIC"];
      }),
    ).toMatch(/does not list this mission M-SYNTHETIC-INTAKE as an owner/);
    expect(
      errorsFor((draft) => {
        delete draft.decisions[1].reason;
      }),
    ).toMatch(/requires a reason/);
  });

  it("fails on a supersession without approval evidence", () => {
    expect(
      errorsFor((draft) => {
        delete draft.decisions[4].approval;
      }),
    ).toMatch(/supersession without approval evidence/);
    expect(
      errorsFor((draft) => {
        delete draft.decisions[4].superseded_by;
      }),
    ).toMatch(/must name the superseding decision in superseded_by/);
  });

  it("fails when a superseded decision is still treated as current authority", () => {
    expect(
      errorsFor((draft) => {
        draft.decisions[5].disposition = "superseded";
        draft.decisions[5].superseded_by = "D1";
        draft.decisions[5].approval = { words: "Superseded too.", date: "2026-08-22" };
      }),
    ).toMatch(/D6, which is itself superseded and cannot be current authority/);

    expect(
      errorsFor((draft) => {
        draft.decisions[4].workflow = "W1";
      }),
    ).toMatch(/is superseded but names owning workflow W1/);
  });

  it("renders the human-readable coverage from the canonical state alone", () => {
    const state = { mission_id: missionId, decision_coverage: coverage() };
    const rendered = renderDecisionCoverage(state);
    expect(rendered).toContain("# Controlling-decision coverage — M-SYNTHETIC-INTAKE");
    expect(rendered).toContain("| `D1` | `workflow` | W1 (also referenced by W2) |");
    expect(rendered).toContain("| `D5` | `superseded` | superseded by D6 |");
    expect(rendered).toContain('Brian 2026-08-22: "Yes, D6 replaces D5."');
    expect(rendered).toContain("| **Total** | **6** |");
    expect(renderDecisionCoverage(state)).toBe(rendered);
  });
});

type IntakeState = {
  mission_id: string;
  ledger_version?: number;
  stage: string;
  baseline: { branch: string; commit: string };
  approvals: Record<string, Approval>;
  workflows: {
    id: string;
    name: string;
    state: string;
    stale: boolean;
    feedback: { screen_id: string; text: string }[];
  }[];
  mockup_hub?: unknown;
  decision_coverage?: Coverage;
  next_action: string;
};

describe("the workflow stage gate", () => {
  const baseState = (): IntakeState => ({
    mission_id: missionId,
    ledger_version: 2,
    stage: "workflows",
    baseline: { branch: "main", commit: "315fbbbcdff2da3a5b6ead2d4352785bb12943be" },
    approvals: {
      boundary: { words: "Approve the boundary.", date: "2026-08-22" },
      overview: { words: "Approve the overview.", date: "2026-08-22" },
      inventory: { words: "Approve W1 and W2.", date: "2026-08-22" },
    },
    workflows: [
      { id: "W1", name: "One", state: "spec_draft", stale: false, feedback: [] },
      { id: "W2", name: "Two", state: "not_started", stale: false, feedback: [] },
    ],
    mockup_hub: { not_applicable: "This synthetic mission draws no mockups." },
    decision_coverage: coverage(),
    next_action: "Draft W1",
  });

  it("refuses the workflow stage without decision coverage", () => {
    expect(validateIntakeState(baseState())).toEqual([]);
    const missing = baseState();
    delete missing.decision_coverage;
    expect(validateIntakeState(missing).join("\n")).toMatch(
      /decision_coverage is required before the workflow stage/,
    );
  });

  it("refuses conflicting coverage at the workflow stage", () => {
    const conflicting = baseState();
    conflicting.decision_coverage!.decisions[0].workflow = "W7";
    expect(validateIntakeState(conflicting).join("\n")).toMatch(/names unknown workflow W7/);
  });

  it("keeps a pre-LAN-149 ledger valid only as a closed record", () => {
    const legacy = baseState();
    delete legacy.ledger_version;
    delete legacy.decision_coverage;
    delete legacy.mockup_hub;
    expect(validateIntakeState(legacy).join("\n")).toMatch(
      /a version 1 ledger is a closed historical record/,
    );
  });
});
