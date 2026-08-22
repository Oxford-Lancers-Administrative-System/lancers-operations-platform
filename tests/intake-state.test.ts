import { describe, expect, it } from "vitest";
import { renderResumeBanner, validateIntakeState } from "../scripts/intake/lib/state.mjs";

const state = {
  mission_id: "M-SYNTHETIC-INTAKE",
  ledger_version: 2,
  stage: "workflows",
  baseline: {
    branch: "main",
    commit: "315fbbbcdff2da3a5b6ead2d4352785bb12943be",
  },
  approvals: {
    boundary: { words: "Approve the boundary.", date: "2026-08-20" },
    overview: { words: "Approve the overview.", date: "2026-08-20" },
    inventory: { words: "Approve W1 and W2.", date: "2026-08-20" },
  },
  workflows: [
    {
      id: "W1",
      name: "Review one synthetic outcome",
      state: "mock_draft",
      stale: false,
      feedback: [{ screen_id: "W1-02", text: "Show the failure state." }],
      approvals: {
        spec: { words: "The W1 specification is approved.", date: "2026-08-20" },
      },
    },
    {
      id: "W2",
      name: "Confirm the synthetic result",
      state: "spec_draft",
      stale: false,
      feedback: [],
    },
  ],
  mockup_hub: "generated",
  decision_coverage: {
    sources: [
      {
        id: "SRC-brief",
        ref: "https://example.invalid/synthetic-brief",
        version: "2026-08-20",
        decision_ids: ["D1"],
      },
    ],
    decisions: [
      {
        id: "D1",
        source_id: "SRC-brief",
        disposition: "workflow",
        workflow: "W1",
        reason: "W1 owns the only journey the brief describes.",
      },
    ],
  },
  next_action: "Revise W1-02 per Brian 2026-08-20",
};

describe("mission intake state", () => {
  it("validates and renders a complete fresh-session resume banner", () => {
    expect(validateIntakeState(state)).toEqual([]);
    expect(renderResumeBanner(state)).toBe(
      [
        "Mission intake resume — M-SYNTHETIC-INTAKE",
        "Stage: workflows",
        "W1 · Review one synthetic outcome: mock_draft",
        "W2 · Confirm the synthetic result: spec_draft",
        "Next action: Revise W1-02 per Brian 2026-08-20",
      ].join("\n"),
    );
  });

  it("fails closed instead of guessing from inconsistent state", () => {
    expect(validateIntakeState({ ...state, stage: "invented" }).join("\n")).toMatch(
      /stage must be one of/,
    );
    expect(
      validateIntakeState({
        ...state,
        workflows: [state.workflows[1]],
      }).join("\n"),
    ).toMatch(/consecutively numbered from W1/);
    expect(
      validateIntakeState({
        ...state,
        workflows: [
          {
            ...state.workflows[0],
            state: "done",
            approvals: {
              ...state.workflows[0].approvals,
              mock: { words: "The W1 mock is approved.", date: "2026-08-20" },
            },
          },
        ],
      }).join("\n"),
    ).toMatch(/cannot be done with open feedback/);
    expect(
      validateIntakeState({
        ...state,
        workflows: [
          state.workflows[0],
          {
            ...state.workflows[1],
            state: "spec_approved",
            approvals: {
              spec: { words: "The W2 specification is approved.", date: "2026-08-20" },
            },
          },
        ],
      }).join("\n"),
    ).toMatch(/cannot be approved before every earlier workflow is done/);
  });
});
