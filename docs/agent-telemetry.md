# Agent telemetry schema

Written by `scripts/telemetry/harvest.mjs` into the private `agent-telemetry`
repository. Rows are counts, identifiers and timestamps.

## Sources

| Source                                                       | Feeds                          |
| ------------------------------------------------------------ | ------------------------------ |
| `~/.claude/projects/<project>/<session>.jsonl`               | `sessions`, `requests`         |
| `~/.claude/projects/<project>/<session>/subagents/agent-*`   | `agent_runs`, `requests`       |
| `~/.local/state/lancers-operations-platform/<id>/missions/*` | `mission_events`, `work_links` |

## Layout

```
data/sessions/<session_id>.json          one object per session
data/requests/<session_id>.ndjson        one row per API request
data/agent_runs/<session_id>.ndjson      one row per subagent
data/work_links/<session_id>.ndjson      correlation rows
data/work_links/mission-<MISSION>.ndjson correlation rows from the journal
data/mission_events/<MISSION>.ndjson     journal events, verbatim
manifest.json                            source fingerprints
harvest.log                              one line per run
```

One file per source keeps the harvest idempotent and lets DuckDB glob a table.

## Tables

### `sessions`

Identity (`session_id`, `project_dir`, `cwd`, `git_branch`, `version`), span
(`started_at`, `ended_at`), volume (`user_turns`, `requests`, `tool_calls`,
`tool_histogram`, `compactions`), work (`commands`, `issue_mentions`,
`pr_number`), and four token figures described under **Token accounting**.

### `requests`

One row per API request, keyed by `request_id`, with `model`, `effort`,
`service_tier`, `is_sidechain` and the five token counts. `subject_kind` is
`session` or `agent_run`; `subject_id` names which. This is the grain for
context-growth analysis — `cache_read_input_tokens` is the conversation being
re-sent on every turn.

### `agent_runs`

One row per subagent: `agent_id`, `parent_session_id`, `agent_type`
(`implementation-worker`, `code-reviewer`, `scout`), `worktree_branch`,
`spawn_depth`, its own token totals. `agent_type` is what makes tokens-by-role
answerable.

### `work_links`

Entity-attribute rows: `subject_kind`, `subject_id`, `link_type`
(`workflow`, `issue`, `pr`, `branch`, `mission`, `package`, `worker`, `role`,
`parent_session`), `link_value`, `source`, `confidence`.

`confidence` is `exact` for a slash-command argument, branch name, PR link or
journal event, and `mention` for an issue id merely appearing in the text.
**Filter to `exact` when attributing effort**; a long session mentions dozens of
issues it never touched.

### `mission_events`

Each journal line verbatim plus `mission_id`. Types include
`worker-dispatched`, `worker-receipt`, `review-receipt`, `pr-opened`,
`owner-question`, `owner-answer`, `merge-recorded`, `lead-heartbeat`.

## The mission-to-agent join

`worker-dispatched` records `worktree: .../.claude/worktrees/agent-<id>`, and
that `agent-<id>` is the subagent transcript's filename. So:

```
mission_events.worktree → basename → agent_runs.agent_id → requests.subject_id
```

This is exact and needed no new instrumentation. It is emitted as `work_links`
rows with `link_type` in (`mission`, `package`, `worker`).

## Token accounting

Each session carries four figures, deliberately kept separate:

| Field              | Meaning                                          |
| ------------------ | ------------------------------------------------ |
| `usage`            | Derived from this session's own messages         |
| `sidechain_usage`  | Derived from inlined sidechain records, if any   |
| `attributed_usage` | `usage` plus every subagent this session spawned |
| `recorded_usage`   | Claude Code's own `cost-state` rollup, per model |

Two things to know before using any of them.

**Requests are collapsed by `request_id`, keeping the highest value per
field.** Several assistant records share one request id, so summing them counts
a request many times over — 264 records against 152 real requests in one
measured session. But which record survives matters just as much. The input and
cache fields repeat unchanged across those records, while `output_tokens` grows
as the response streams. Keeping the first record undercounted one reviewer run
at 7,357 output tokens against a true 53,078, a **7.2x shortfall**. Taking the
maximum per field fixes it: constant fields are unaffected, and the growing one
lands at its final value.

**`attributed_usage` and `recorded_usage` still disagree on delegating
sessions.** Only 19 of 77 sessions in this project carry a rollup at all. Among
those that do, after the collapse was corrected:

| Session shape                         | `recorded / attributed` output |
| ------------------------------------- | ------------------------------ |
| No delegation                         | 1.00 – 1.02                    |
| Spawned subagents                     | 1.6 – 2.6                      |
| One 27-hour session, 17 `Agent` calls | 9.2                            |

The 1.00–1.02 band is benign: messages written after the rollup was last
flushed. Two known contributors explain the shape of the rest, both about work
the transcripts never held:

- **Model labels differ between the transcript and billing.** `message.model`
  records the base name while the rollup uses the context variant. A session
  whose records all say `claude-opus-5` is billed under `claude-opus-5[1m]`.
  Per-model comparisons must expect this.
- **`Agent` dispatches do not always leave a `subagents/` directory.** The 9.2x
  session made seventeen `Agent` calls and has none. Its rollup attributes 2.2M
  output tokens to Sonnet while its transcript holds no Sonnet record at all,
  so that work is genuinely absent from local logs.

Note the tool is named `Agent`, not `Task`: a session with `agent_run_count` of
zero has not necessarily delegated nothing. Check `tool_histogram.Agent`.

So `attributed_usage` is complete over what the transcripts contain,
`recorded_usage` is what Claude Code billed, and any analysis should state
which it used. `usage_reconciliation` carries both plus an `agrees` flag. Treat
per-session derived totals as a floor, and prefer `recorded_usage` when asking
what a session actually cost.

## Free-text fields

The rule is no conversation text. Two labelling exceptions, both short and both
model-authored, are kept because without them every row is an opaque UUID:

- `sessions.ai_title` — the generated session title.
- `agent_runs.description` — the one-line task summary, e.g. "Fix roster board
  authorization blocker".

Drop both if the repository's audience ever widens.

## Querying

```sql
-- output tokens by agent role
SELECT agent_type, count(*) AS runs, sum(usage.output_tokens) AS output
FROM read_json_auto('data/agent_runs/*.ndjson')
GROUP BY 1 ORDER BY output DESC;

-- effort per mission package, through the journal join
SELECT l.link_value AS package, sum(r.output_tokens) AS output
FROM read_json_auto('data/work_links/*.ndjson') l
JOIN read_json_auto('data/requests/*.ndjson') r ON r.subject_id = l.subject_id
WHERE l.link_type = 'package' AND l.confidence = 'exact'
GROUP BY 1 ORDER BY output DESC;

-- context re-sent per workflow
SELECT l.link_value AS workflow, avg(r.cache_read_input_tokens) AS avg_context
FROM read_json_auto('data/work_links/*.ndjson') l
JOIN read_json_auto('data/requests/*.ndjson') r ON r.subject_id = l.subject_id
WHERE l.link_type = 'workflow'
GROUP BY 1 ORDER BY avg_context DESC;
```
