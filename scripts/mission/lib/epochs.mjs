/**
 * Lead epochs: the bounded orchestration assignment one Mission Lead holds.
 *
 * Mission 4 (M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY) recorded 645
 * events, 448 of them Lead heartbeats, under a single Lead that ran from plan
 * approval through five packages, twenty correction dispatches and every merge.
 * The repository already said the Lead stops after plan approval and a fresh
 * Lead resumes; `nextActions` already recommended `recycle-lead`. Nothing
 * refused the continuation, because the rule was prose and advice rather than a
 * precondition on the events that change state.
 *
 * An epoch turns that rule into a fence. It is mission control state — not
 * another package lifecycle and not another Linear status — and it answers one
 * question at every write: is this Lead still inside the assignment the harness
 * derived for it from durable state?
 *
 * This module holds the parts of that answer which depend on nothing but the
 * epoch itself: the phase vocabulary, the thresholds, the class of each journal
 * event, what each phase permits, the deterministic health colour, and the
 * dossier projection. Derivation of the next epoch from mission state, and the
 * refusals themselves, live in state.mjs beside the state they read.
 */

/** The phases a Lead epoch can carry, in the order a mission walks them. */
export const EPOCH_PHASES = [
  "planning",
  "post-plan-boundary",
  "implementation-wave",
  "integration",
  "acceptance-cutover",
  "closeout",
];

/**
 * `open` is the only status that may dispatch. `boundary-pending` is reached by
 * an exit condition or a safety threshold, not by the Lead's assent; `draining`
 * pins the boundary to the work that was already active when it began; `closed`
 * is terminal and never reopens.
 */
export const EPOCH_STATUSES = ["open", "boundary-pending", "draining", "closed"];

export const EPOCH_EVENT_TYPES = [
  "lead-epoch-opened",
  "lead-epoch-boundary-reached",
  "lead-epoch-draining",
  "lead-epoch-adjusted",
  "lead-epoch-closed",
];

export const HEALTH_COLORS = ["green", "yellow", "red"];

export const ADJUSTMENT_KINDS = ["extend-current", "recut-future"];

/**
 * Every threshold in one place, because a threshold nobody can find is a
 * threshold nobody can argue with. Each one is asserted by a behaviour test
 * rather than by reading this object back to itself.
 */
export const EPOCH_LIMITS = {
  /** An execution wave is at most two implementation packages. */
  wavePackages: 2,
  /** One normal extension per epoch. A second is refused, whatever its health. */
  adjustmentBudget: 1,
  /** An extension expires when its named work stabilizes or after two hours. */
  extensionMs: 2 * 60 * 60 * 1000,
  yellowAgeMs: 4 * 60 * 60 * 1000,
  redAgeMs: 6 * 60 * 60 * 1000,
  yellowOwnerAnswers: 6,
  redOwnerAnswers: 10,
  /** A third invocation on one package lineage is a repeated correction premise. */
  redReviewRound: 3,
};

/**
 * What class of work each journal event is.
 *
 * `always` is the honest exception list, and it is short on purpose: reading
 * state, recording what Brian decided, annotating the journal, checkpointing,
 * and giving resources back. Everything else is work a boundary can refuse.
 *
 * Reclamation and the terminal mission events stay `always` because
 * `/finish-mission` exists precisely for the case where the Lead is gone; a
 * fence that stopped a dead mission being tidied up would protect nothing.
 */
export const EVENT_ACTION_CLASSES = {
  "mission-init": "always",
  "lead-heartbeat": "always",
  "plan-recorded": "replan",
  "plan-approved": "planning",
  "linear-preflight": "always",
  "dispatch-deferred": "always",
  "linear-sync-intent": "sync",
  "linear-sync-result": "sync",
  "worker-dispatched": "dispatch",
  "worker-receipt": "evidence",
  "worker-abandoned": "evidence",
  "correction-dispatched": "correction-dispatch",
  "pr-opened": "evidence",
  "review-receipt": "evidence",
  "integrated-review": "integration",
  "visual-approval": "progression",
  "owner-question": "always",
  "owner-answer": "always",
  "rule-applied": "always",
  "journal-annotation": "always",
  "package-gate-passed": "progression",
  "package-gate-invalidated": "always",
  "merge-recorded": "progression",
  checkpoint: "always",
  "scope-drift": "always",
  "packet-revised": "always",
  "package-reclaimed": "always",
  "mission-closeout": "closeout",
  "mission-finalized": "always",
  "mission-abandoned": "always",
  "mission-stopped": "always",
  "mission-resumed": "always",
};

/** The classes whose event names a package, and so must be inside epoch scope. */
export const PACKAGE_SCOPED_CLASSES = [
  "dispatch",
  "correction-dispatch",
  "evidence",
  "progression",
];

/**
 * What each phase adds to `always`.
 *
 * `post-plan-boundary` and `acceptance-cutover` add nothing: the first is the
 * mandatory recycle Mission 4 skipped, and the second is Brian's and an
 * external service's work, not the Lead's.
 */
export const PHASE_PERMITS = {
  planning: ["replan", "planning"],
  "post-plan-boundary": [],
  // `replan` but not `planning`: a Lead that finds the decomposition wrong
  // mid-wave may record a revised one, because recording a plan creates
  // nothing. Approving it is a different act, and it belongs to a fresh
  // planning epoch — otherwise the drift/revise path would deadlock, since a
  // replan is what makes the harness derive `planning` in the first place.
  "implementation-wave": [
    "replan",
    "sync",
    "dispatch",
    "correction-dispatch",
    "evidence",
    "progression",
  ],
  integration: ["integration"],
  "acceptance-cutover": [],
  closeout: ["closeout"],
};

/**
 * What survives a boundary: finishing what was already running, never starting
 * anything. A correction dispatch is admitted only as a re-scope of a worker
 * that is already correcting in scope, which state.mjs decides.
 */
export const BOUNDARY_PERMITTED_CLASSES = ["evidence", "progression"];

const isNonEmptyString = (value) => typeof value === "string" && value.trim() !== "";

/** An epoch's empty signal ledger, accumulated by the reducer as events replay. */
export function emptyEpochSignals() {
  return {
    ownerAnswers: [],
    workerAbandoned: [],
    leadAnnotations: [],
    reviewRounds: {},
    sessionReplacements: [],
    leadFiledDelegatedEvidence: [],
  };
}

/**
 * The deterministic health colour and the evidence that produced it.
 *
 * Every reason carries a code and, where an event caused it, that event's
 * zero-based journal index — so "why is this red" is answered by pointing at
 * the journal rather than by the Lead's opinion of its own coherence.
 *
 * `unknown` is separate from the reasons on purpose. The host exposes no
 * context-usage telemetry today, and treating its absence as a pressure signal
 * would make green unreachable and the green-only extension path dead on
 * arrival. So an absent signal is reported as unknown and is never counted as
 * evidence of health: green here means "no recorded pressure signal since this
 * epoch opened", never "this Lead's context is proved healthy". When an epoch
 * is opened against a declared context-usage source and that source later goes
 * unreadable, that *is* a yellow signal, because something expected went away.
 */
export function epochHealth(epoch, state, { now = Date.now() } = {}) {
  if (!epoch) return null;
  const yellow = [];
  const red = [];
  const unknown = [];
  const signals = epoch.signals ?? emptyEpochSignals();

  const age = now - Date.parse(epoch.opened_at);
  if (Number.isFinite(age)) {
    if (age >= EPOCH_LIMITS.redAgeMs) {
      red.push({
        code: "epoch-age",
        detail: `The epoch opened at ${epoch.opened_at} and has run at least ${EPOCH_LIMITS.redAgeMs / 3_600_000} hours.`,
        event_index: epoch.opening_event_index,
      });
    } else if (age >= EPOCH_LIMITS.yellowAgeMs) {
      yellow.push({
        code: "epoch-age",
        detail: `The epoch opened at ${epoch.opened_at} and has run at least ${EPOCH_LIMITS.yellowAgeMs / 3_600_000} hours.`,
        event_index: epoch.opening_event_index,
      });
    }
  }

  const answers = signals.ownerAnswers;
  if (answers.length >= EPOCH_LIMITS.redOwnerAnswers) {
    red.push({
      code: "owner-answers",
      detail: `${answers.length} owner answers were persisted in this epoch (red at ${EPOCH_LIMITS.redOwnerAnswers}).`,
      event_index: answers.at(-1).event_index,
    });
  } else if (answers.length >= EPOCH_LIMITS.yellowOwnerAnswers) {
    yellow.push({
      code: "owner-answers",
      detail: `${answers.length} owner answers were persisted in this epoch (yellow at ${EPOCH_LIMITS.yellowOwnerAnswers}).`,
      event_index: answers.at(-1).event_index,
    });
  }

  for (const entry of signals.leadAnnotations) {
    red.push({
      code: "lead-entry-corrected",
      detail: `Journal event ${entry.target_event} was ${entry.disposition} in this epoch; the Lead's own record needed correcting.`,
      event_index: entry.event_index,
    });
  }
  for (const entry of signals.workerAbandoned) {
    red.push({
      code: "worker-abandoned",
      detail: `${entry.package_id} lost its worker in this epoch.`,
      event_index: entry.event_index,
    });
  }
  for (const [packageId, rounds] of Object.entries(signals.reviewRounds)) {
    const repeated = rounds.filter((round) => round.round >= EPOCH_LIMITS.redReviewRound);
    if (repeated.length > 0) {
      red.push({
        code: "review-round-repeat",
        detail: `${packageId} reached review round ${repeated.at(-1).round} in this epoch; a third invocation on one lineage is a repeated correction premise, not a code question.`,
        event_index: repeated.at(-1).event_index,
      });
    }
  }
  for (const entry of signals.sessionReplacements) {
    red.push({
      code: "session-replaced",
      detail: `Lead identity ${entry.lead_id} acted inside an epoch opened by ${epoch.lead_id}; the session was replaced or compacted under the same assignment.`,
      event_index: entry.event_index,
    });
  }
  for (const entry of signals.leadFiledDelegatedEvidence) {
    red.push({
      code: "lead-filed-delegated-evidence",
      detail: `${entry.package_id} carries evidence filed under the Lead's own identity, which belongs to a worker or reviewer.`,
      event_index: entry.event_index,
    });
  }
  if (epoch.session_identity_reused) {
    red.push({
      code: "session-identity-reused",
      detail: `Lead identity ${epoch.lead_id} already held an earlier epoch on this mission.`,
      event_index: epoch.opening_event_index,
    });
  }
  if (!isNonEmptyString(epoch.lead_id)) {
    red.push({
      code: "session-identity-absent",
      detail: "The epoch carries no Lead identity, so nothing fences it.",
      event_index: epoch.opening_event_index,
    });
  }

  const activeCorrection = (state?.activeWorkers ?? []).find(
    (worker) => worker.kind === "correction",
  );
  const blockedReview = Object.values(state?.packages ?? {}).find(
    (pkg) => pkg.status === "blocked" && pkg.review?.result === "blocked",
  );
  if (activeCorrection || blockedReview) {
    yellow.push({
      code: "correction-round-active",
      detail: activeCorrection
        ? `${activeCorrection.package_id} is inside an active correction round.`
        : `${blockedReview.id} is blocked by its review and owes a correction.`,
      event_index: null,
    });
  }

  const scope = epoch.scope?.packages ?? [];
  const unmerged = scope.filter((id) => state?.packages?.[id]?.status !== "merged");
  if (scope.length > 0 && unmerged.length > 0 && unmerged.length < scope.length) {
    const settled = unmerged.every(
      (id) => state.packages[id]?.gate_passed?.head_sha === state.packages[id]?.head_sha,
    );
    if (settled) {
      yellow.push({
        code: "approaching-scope-boundary",
        detail: `Every remaining package in this wave (${unmerged.join(", ")}) has passed its gate; the epoch is one merge from its exit condition.`,
        event_index: null,
      });
    }
  }

  if (epoch.context_usage_source) {
    yellow.push({
      code: "context-usage-unavailable",
      detail: `This epoch was opened against context-usage source "${epoch.context_usage_source}", which cannot be read back. An expected signal that disappeared is a pressure signal.`,
      event_index: epoch.opening_event_index,
    });
  } else {
    unknown.push({
      signal: "context-usage",
      detail:
        "The host exposes no context-usage telemetry. This reads unknown and is never counted as evidence of health: green means no recorded pressure signal, not a proved-healthy context.",
    });
  }

  const color = red.length > 0 ? "red" : yellow.length > 0 ? "yellow" : "green";
  return { color, reasons: [...red, ...yellow], red, yellow, unknown };
}

/**
 * The compact projection a fresh Lead reads instead of the journal.
 *
 * Built from reduced state, never from the outgoing Lead's narration — which is
 * the point: the Lead being replaced is exactly the party whose summary cannot
 * be trusted. Heartbeats, superseded receipt prose and lease mechanics are
 * absent because nothing here reads raw events; the append-only journal remains
 * the audit source, and this is the working set.
 */
export function buildResumeDossier(state, { now = Date.now(), actions = [], epoch = null } = {}) {
  const packet = state.packet ?? null;
  const live = Object.values(state.packages).filter((pkg) => pkg.status !== "removed");
  const activeIds = new Set(state.activeWorkers.map((worker) => worker.package_id));
  const waitingOn = (pkg) =>
    (pkg.depends_on ?? []).filter((dep) => state.packages[dep]?.status !== "merged");

  const completed = live
    .filter((pkg) => pkg.status === "merged")
    .map((pkg) => ({
      id: pkg.id,
      linear_issue_id: pkg.linear_issue_id ?? null,
      pr_number: pkg.pr_number ?? null,
      merge_sha: pkg.merged?.sha ?? null,
      route: pkg.merged?.route ?? null,
      reclaimed: state.reclaimed.includes(pkg.id),
    }));

  const active = state.activeWorkers.map((worker) => ({
    id: worker.package_id,
    worker_id: worker.worker_id,
    kind: worker.kind,
    dispatched_at: worker.dispatched_at,
    branch: state.packages[worker.package_id]?.branch ?? null,
    head_sha: state.packages[worker.package_id]?.head_sha ?? null,
    correction_finding_ids: worker.finding_ids ?? null,
  }));

  const openQuestionsFor = (packageId) =>
    Object.values(state.questions).filter(
      (question) => question.status === "open" && question.affected_packages.includes(packageId),
    );

  const blocked = live
    .filter(
      (pkg) =>
        pkg.status !== "merged" &&
        !activeIds.has(pkg.id) &&
        (pkg.driftStopped ||
          ["blocked", "owner-decision"].includes(pkg.status) ||
          openQuestionsFor(pkg.id).length > 0),
    )
    .map((pkg) => ({
      id: pkg.id,
      status: pkg.status,
      why: pkg.driftStopped
        ? "Stopped by source drift; it needs a revised approved packet before work resumes."
        : pkg.status === "blocked"
          ? "A blocking review receipt owes a correction to the original worker."
          : pkg.status === "owner-decision"
            ? "Its worker returned owner-decision-required."
            : "An unanswered owner question names it.",
      open_questions: openQuestionsFor(pkg.id).map((question) => question.id),
    }));

  const blockedIds = new Set(blocked.map((entry) => entry.id));
  const waiting = live
    .filter(
      (pkg) =>
        pkg.status !== "merged" &&
        !activeIds.has(pkg.id) &&
        !blockedIds.has(pkg.id) &&
        waitingOn(pkg).length > 0,
    )
    .map((pkg) => ({ id: pkg.id, status: pkg.status, waiting_on: waitingOn(pkg) }));

  // Only heads that still matter. A merged package's evidence is its merge SHA,
  // recorded above; repeating its receipts here is exactly the superseded prose
  // the dossier exists to leave behind.
  const frontier_heads = Object.fromEntries(
    live
      .filter((pkg) => pkg.status !== "merged" && pkg.head_sha)
      .map((pkg) => [
        pkg.id,
        {
          head_sha: pkg.head_sha,
          pr_number: pkg.pr_number ?? null,
          review: pkg.review
            ? {
                result: pkg.review.result,
                round: pkg.review.round,
                reviewed_head_sha: pkg.review.reviewed_head_sha,
                review_mode: pkg.review.review_mode,
              }
            : null,
          gate_passed_at_head: pkg.gate_passed?.head_sha === pkg.head_sha,
          visual: pkg.visual,
          visual_approved_at_head: Boolean(
            pkg.visual_approval && pkg.visual_approval.head_sha === pkg.head_sha,
          ),
        },
      ]),
  );

  const open_owner_decisions = Object.values(state.questions)
    .filter((question) => question.status === "open")
    .map((question) => ({
      id: question.id,
      classification: question.classification,
      text: question.text,
      affected_packages: question.affected_packages,
    }));

  // A closed question with no operative rule is finished business. What travels
  // is the rule it produced, and any journal entry a later reader must not take
  // at face value.
  const operative_corrected_decisions = [
    ...state.annotations
      .filter((annotation) => annotation.disposition === "corrected")
      .map((annotation) => ({
        kind: "journal-correction",
        target_event: annotation.target_event,
        correction: annotation.correction,
      })),
    ...Object.values(state.questions)
      .filter((question) => question.status === "answered" && question.answer?.reusable)
      .map((question) => ({
        kind: "reusable-answer",
        question_id: question.id,
        answer: question.answer.text,
      })),
    ...state.rulesApplied.map((rule) => ({
      kind: "applied-rule",
      rule_id: rule.rule_id,
      context: rule.context,
    })),
  ];

  const unverified_acceptance_criteria = [
    ...(packet?.requirements ?? [])
      .map((requirement) => {
        const owners = live.filter((pkg) => (pkg.requirement_ids ?? []).includes(requirement.id));
        const outstanding = owners.filter((pkg) => pkg.status !== "merged");
        if (owners.length > 0 && outstanding.length === 0) return null;
        return {
          requirement_id: requirement.id,
          text: requirement.text,
          blocked_by: outstanding.map((pkg) => pkg.id),
          planned: owners.length > 0,
        };
      })
      .filter(Boolean),
    ...(state.closeout
      ? []
      : (packet?.completion_evidence ?? []).map((evidence) => ({
          completion_evidence: evidence,
          verified: false,
        }))),
  ];

  return {
    generated_at: new Date(now).toISOString(),
    source_event_index: state.eventCount - 1,
    mission_id: packet?.mission_id ?? null,
    objective: packet?.objective ?? null,
    operative_invariants: {
      non_goals: packet?.non_goals ?? [],
      decisions: (packet?.decisions ?? []).map((decision) => ({
        id: decision.id,
        text: decision.text,
      })),
      owner_gated_merge_classes: packet?.merge_envelope?.owner_gated ?? [],
      packet_version: packet?.packet_version ?? null,
      baseline_commit: packet?.baseline?.commit ?? null,
    },
    phase: epoch?.phase ?? null,
    epoch: epoch
      ? {
          epoch_id: epoch.epoch_id,
          phase: epoch.phase,
          status: epoch.status,
          boundary_reason: epoch.boundary_reason ?? null,
          scope: epoch.scope,
          exit_condition: epoch.exit_condition,
          health: epoch.health
            ? {
                color: epoch.health.color,
                reason_codes: epoch.health.reasons.map((reason) => reason.code),
                unknown: epoch.health.unknown.map((entry) => entry.signal),
              }
            : null,
          next_epoch: epoch.next ?? null,
        }
      : null,
    packages: { completed, active, blocked, waiting },
    frontier_heads,
    open_owner_decisions,
    operative_corrected_decisions,
    owner_and_external_actions: {
      owner_gates: packet?.gates?.owner ?? [],
      external_gates: packet?.gates?.external ?? [],
      closeout_owner_actions: state.closeout?.owner_actions ?? null,
    },
    unverified_acceptance_criteria,
    // The existing abstraction level and no lower: counts, never pids or leases.
    resources: {
      live_packages: live.length,
      active_workers: state.activeWorkers.length,
      reclaimed_packages: state.reclaimed.length,
      checkpoints: state.checkpoints,
    },
    next_permitted_actions: actions,
  };
}
