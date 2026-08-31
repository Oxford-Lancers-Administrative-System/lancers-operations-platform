#!/usr/bin/env node
/**
 * Harvests durable agent-session telemetry out of the Claude Code logs on this
 * machine and into a separate private repository.
 *
 * Why this exists: Claude Code prunes `~/.claude/projects` transcripts on a
 * retention timer, and the mission journal lives in XDG state, outside any
 * repository. Both are machine-local and both expire. Everything we know about
 * how a mission actually ran — tokens by role, worker replacements, review
 * rounds, owner questions — is in those two places and nowhere else.
 *
 * The design rules, in priority order:
 *
 *  1. Never delete. A session that ages off disk keeps the rows derived from
 *     it. Durability past source retention is the entire point.
 *  2. Never write outside the output repository. The sources are read-only.
 *  3. Idempotent. Re-running is cheap and produces the same output; only
 *     sources whose mtime or size moved are re-derived.
 *  4. No message text. The rows are counts, identifiers and timestamps, so
 *     that a transcript's secrets cannot reach the output repository at all.
 *     Two labelling fields are the deliberate exception, documented in
 *     `docs/agent-telemetry.md`.
 *
 * It runs no model and consumes no tokens. See `docs/agent-telemetry.md` for the tables.
 */
import {
  appendFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createInterface } from "node:readline";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { missionPaths } from "../mission/lib/state.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Bump when the extractor changes shape. A changed version invalidates every
 * manifest entry, so the next run re-derives everything with the new logic.
 */
const EXTRACTOR_VERSION = 4;

/** The only remote this script will ever push to. */
const EXPECTED_REMOTE = /[:/]Bschuster3434\/agent-telemetry(\.git)?$/;

const LAN_ISSUE = /\bLAN-(\d+)\b/g;
const COMMAND_NAME = /<command-name>([^<]*)<\/command-name>/g;
const COMMAND_ARGS = /<command-args>([^<]*)<\/command-args>/;
const BRANCH_ISSUE = /\blan-(\d+)\b/i;

const USAGE = `Usage: node scripts/telemetry/harvest.mjs [options]

  --out <dir>        Output repository (default ~/Documents/agent-telemetry)
  --projects <dir>   Claude projects root (default ~/.claude/projects)
  --force            Re-derive every source, ignoring the manifest
  --no-git           Write files but do not commit or push
  --dry-run          Report what would change; write nothing
`;

function parseArgs(argv) {
  const options = {
    projectsRoot: join(homedir(), ".claude", "projects"),
    out: process.env.LANCERS_TELEMETRY_OUT || join(homedir(), "Documents", "agent-telemetry"),
    force: false,
    git: true,
    dryRun: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--force") options.force = true;
    else if (arg === "--no-git") options.git = false;
    else if (arg === "--dry-run") {
      options.dryRun = true;
      options.git = false;
    } else if (arg === "--out") options.out = resolve(argv[(i += 1)]);
    else if (arg === "--projects") options.projectsRoot = resolve(argv[(i += 1)]);
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

/** Writes through a temp file so a crash never leaves a half-written table. */
function writeAtomic(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp`;
  writeFileSync(temp, contents, { mode: 0o600 });
  renameSync(temp, path);
}

function writeNdjson(path, rows) {
  const body = rows.map((row) => JSON.stringify(row)).join("\n");
  writeAtomic(path, rows.length ? `${body}\n` : "");
}

function readJsonIfPresent(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function emptyUsage() {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    thinking_tokens: 0,
    web_search_requests: 0,
    web_fetch_requests: 0,
  };
}

/** Adds a `usage` block into an accumulator, once per request. */
function addUsage(into, usage) {
  if (!usage) return;
  into.input_tokens += usage.input_tokens || 0;
  into.output_tokens += usage.output_tokens || 0;
  into.cache_read_input_tokens += usage.cache_read_input_tokens || 0;
  into.cache_creation_input_tokens += usage.cache_creation_input_tokens || 0;
  into.thinking_tokens += usage.output_tokens_details?.thinking_tokens || 0;
  into.web_search_requests += usage.server_tool_use?.web_search_requests || 0;
  into.web_fetch_requests += usage.server_tool_use?.web_fetch_requests || 0;
}

/**
 * Lifts the authoritative per-model rollup out of a `cost-state` record.
 *
 * This is kept alongside the totals derived from the individual messages
 * because the two still do not agree everywhere.
 *
 * Most of the original gap was this extractor's own fault, keeping the first
 * record of each request and so taking `output_tokens` before the response had
 * finished streaming. Correcting that closed delegating sessions from 4.8-6.8x
 * down to 1.6-2.6x and left undelegated ones at 1.00-1.02.
 *
 * Two known contributors remain, both about work the transcripts do not hold:
 *
 *   - `message.model` records the base name while billing uses the context
 *     variant, so a session whose records all say `claude-opus-5` is billed
 *     under `claude-opus-5[1m]`. Per-model comparisons must expect this.
 *   - Agents dispatched through the `Agent` tool do not always leave a
 *     `subagents/` directory. One 27-hour session with seventeen such calls
 *     has none, and its rollup attributes 2.2M output tokens to Sonnet while
 *     its transcript contains no Sonnet record at all.
 *
 * So the derived totals are complete over what the transcripts contain, and
 * the recorded totals are what Claude Code billed. Analysis should say which
 * it used, and treat derived per-session totals as a floor.
 */
function recordedUsage(costState) {
  if (!costState?.modelUsage) return null;
  const totals = emptyUsage();
  const byModel = {};
  for (const [model, usage] of Object.entries(costState.modelUsage)) {
    byModel[model] = {
      input_tokens: usage.inputTokens || 0,
      output_tokens: usage.outputTokens || 0,
      cache_read_input_tokens: usage.cacheReadInputTokens || 0,
      cache_creation_input_tokens: usage.cacheCreationInputTokens || 0,
      web_search_requests: usage.webSearchRequests || 0,
      cost_usd: usage.costUSD ?? null,
    };
    totals.input_tokens += byModel[model].input_tokens;
    totals.output_tokens += byModel[model].output_tokens;
    totals.cache_read_input_tokens += byModel[model].cache_read_input_tokens;
    totals.cache_creation_input_tokens += byModel[model].cache_creation_input_tokens;
    totals.web_search_requests += byModel[model].web_search_requests;
  }
  return { by_model: byModel, totals };
}

function bump(counter, key) {
  if (key === undefined || key === null) return;
  counter.set(key, (counter.get(key) || 0) + 1);
}

function modeOf(counter) {
  let best = null;
  let bestCount = -1;
  for (const [value, count] of counter) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * Transcript extraction
 * ------------------------------------------------------------------ */

/**
 * Streams one transcript and returns its summary plus its request rows.
 *
 * Two subtleties this handles that a naive reader gets wrong:
 *
 *   - Several assistant records share one `requestId`. Summing them counts a
 *     request many times over, so they are collapsed to one row. Which record
 *     wins matters: the constant fields (input, cache read, cache creation)
 *     repeat unchanged, but `output_tokens` grows across the records as the
 *     response streams. Keeping the first record therefore undercounts output
 *     badly — measured at 7,357 against a true 53,078 on one reviewer run, a
 *     7.2x shortfall. The highest value per field is kept instead, which
 *     leaves the constant fields alone and takes the growing one at its final
 *     value.
 *   - Older transcripts inline subagent traffic as `isSidechain` records in
 *     the parent file, while newer ones write a separate `subagents/` file.
 *     In a session transcript that traffic is tallied separately and kept out
 *     of the session's own totals, so the two eras stay comparable and a
 *     subagent's tokens are never counted twice.
 *
 *     A subagent transcript is the other side of that: every record in it is
 *     flagged `isSidechain`, because from the parent's point of view the whole
 *     file is sidechain traffic. Splitting on the flag there would zero the
 *     run. So the split applies only when reading a session.
 */
async function extractTranscript(path, { subjectKind, subjectId }) {
  const splitSidechain = subjectKind === "session";
  const seenRequests = new Map();
  const requests = [];

  const own = emptyUsage();
  const sidechain = emptyUsage();

  const models = new Map();
  const branches = new Map();
  const tools = new Map();
  const commands = [];
  const issues = new Set();

  let cwd = null;
  let version = null;
  let entrypoint = null;
  let aiTitle = null;
  let firstTimestamp = null;
  let lastTimestamp = null;
  let userTurns = 0;
  let assistantRecords = 0;
  let toolCalls = 0;
  let compactions = 0;
  let abortedStreams = 0;
  let malformedLines = 0;
  let prNumber = null;
  let prUrl = null;
  let costState = null;

  const stream = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of stream) {
    if (!line.trim()) continue;

    // Cheaper on the raw string than walking the parsed structure, and it
    // catches issue ids wherever they appear: prompts, tool output, receipts.
    for (const match of line.matchAll(LAN_ISSUE)) issues.add(`LAN-${match[1]}`);

    let record;
    try {
      record = JSON.parse(line);
    } catch {
      malformedLines += 1;
      continue;
    }

    if (record.timestamp) {
      if (!firstTimestamp || record.timestamp < firstTimestamp) {
        firstTimestamp = record.timestamp;
      }
      if (!lastTimestamp || record.timestamp > lastTimestamp) {
        lastTimestamp = record.timestamp;
      }
    }
    if (record.cwd && !cwd) cwd = record.cwd;
    if (record.version) version = record.version;
    if (record.entrypoint && !entrypoint) entrypoint = record.entrypoint;
    bump(branches, record.gitBranch);

    switch (record.type) {
      case "assistant": {
        assistantRecords += 1;
        if (record.isAbortedMidStream) abortedStreams += 1;
        bump(models, record.message?.model);

        for (const block of record.message?.content || []) {
          if (block?.type === "tool_use") {
            toolCalls += 1;
            bump(tools, block.name);
          }
        }

        const usage = record.message?.usage;
        const requestId = record.requestId || record.uuid;
        const existing = requestId ? seenRequests.get(requestId) : undefined;

        if (existing) {
          existing.input_tokens = Math.max(existing.input_tokens, usage?.input_tokens ?? 0);
          existing.output_tokens = Math.max(existing.output_tokens, usage?.output_tokens ?? 0);
          existing.cache_read_input_tokens = Math.max(
            existing.cache_read_input_tokens,
            usage?.cache_read_input_tokens ?? 0,
          );
          existing.cache_creation_input_tokens = Math.max(
            existing.cache_creation_input_tokens,
            usage?.cache_creation_input_tokens ?? 0,
          );
          existing.thinking_tokens = Math.max(
            existing.thinking_tokens,
            usage?.output_tokens_details?.thinking_tokens ?? 0,
          );
          existing.web_search_requests = Math.max(
            existing.web_search_requests,
            usage?.server_tool_use?.web_search_requests ?? 0,
          );
          existing.web_fetch_requests = Math.max(
            existing.web_fetch_requests,
            usage?.server_tool_use?.web_fetch_requests ?? 0,
          );
          break;
        }

        const row = {
          subject_kind: subjectKind,
          subject_id: subjectId,
          request_id: record.requestId ?? null,
          uuid: record.uuid ?? null,
          at: record.timestamp ?? null,
          model: record.message?.model ?? null,
          effort: record.effort ?? null,
          service_tier: usage?.service_tier ?? null,
          speed: usage?.speed ?? null,
          is_sidechain: Boolean(record.isSidechain),
          input_tokens: usage?.input_tokens ?? 0,
          output_tokens: usage?.output_tokens ?? 0,
          cache_read_input_tokens: usage?.cache_read_input_tokens ?? 0,
          cache_creation_input_tokens: usage?.cache_creation_input_tokens ?? 0,
          thinking_tokens: usage?.output_tokens_details?.thinking_tokens ?? 0,
          web_search_requests: usage?.server_tool_use?.web_search_requests ?? 0,
          web_fetch_requests: usage?.server_tool_use?.web_fetch_requests ?? 0,
        };
        if (requestId) seenRequests.set(requestId, row);
        requests.push(row);
        break;
      }

      case "user": {
        if (record.isMeta) break;
        userTurns += 1;
        const content = record.message?.content;
        const text =
          typeof content === "string"
            ? content
            : (content || [])
                .map((block) => (typeof block?.text === "string" ? block.text : ""))
                .join("\n");
        for (const match of text.matchAll(COMMAND_NAME)) {
          commands.push({
            command: match[1].trim(),
            args: text.match(COMMAND_ARGS)?.[1]?.trim() || null,
            at: record.timestamp ?? null,
          });
        }
        break;
      }

      case "system":
        if (record.subtype === "compact_boundary") compactions += 1;
        break;

      case "cost-state":
        costState = record;
        break;

      case "pr-link":
        prNumber = record.prNumber ?? null;
        prUrl = record.prUrl ?? null;
        break;

      case "ai-title":
        aiTitle = record.aiTitle ?? null;
        break;

      default:
        break;
    }
  }

  // Totals come from the collapsed rows rather than being accumulated as
  // records stream past: a request's final output count is only known once
  // every record carrying its id has been seen.
  for (const row of requests) {
    const into = splitSidechain && row.is_sidechain ? sidechain : own;
    into.input_tokens += row.input_tokens;
    into.output_tokens += row.output_tokens;
    into.cache_read_input_tokens += row.cache_read_input_tokens;
    into.cache_creation_input_tokens += row.cache_creation_input_tokens;
    into.thinking_tokens += row.thinking_tokens;
    into.web_search_requests += row.web_search_requests;
    into.web_fetch_requests += row.web_fetch_requests;
  }

  return {
    requests,
    summary: {
      cwd,
      version,
      entrypoint,
      ai_title: aiTitle,
      started_at: firstTimestamp,
      ended_at: lastTimestamp,
      git_branch: modeOf(branches),
      git_branches: [...branches.keys()].filter(Boolean).sort(),
      models: [...models.keys()].filter(Boolean).sort(),
      primary_model: modeOf(models),
      user_turns: userTurns,
      assistant_records: assistantRecords,
      requests: requests.length,
      tool_calls: toolCalls,
      tool_histogram: Object.fromEntries([...tools.entries()].sort()),
      commands,
      issue_mentions: [...issues].sort(),
      compactions,
      aborted_streams: abortedStreams,
      malformed_lines: malformedLines,
      pr_number: prNumber,
      pr_url: prUrl,
      recorded_cost_usd: costState?.totalCostUSD ?? null,
      recorded_usage: recordedUsage(costState),
      cost_state: costState
        ? {
            total_api_duration_ms: costState.totalAPIDuration ?? null,
            total_tool_duration_ms: costState.totalToolDuration ?? null,
            total_duration_ms: costState.totalDuration ?? null,
            lines_added: costState.totalLinesAdded ?? null,
            lines_removed: costState.totalLinesRemoved ?? null,
            start_time: costState.startTime ?? null,
          }
        : null,
      usage: own,
      sidechain_usage: sidechain,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Work links
 * ------------------------------------------------------------------ */

/**
 * One row per (subject, link type, value). An entity-attribute shape rather
 * than a wide table because a session legitimately touches many issues and
 * several workflows, and because new link types should not require a schema
 * change to the sessions table.
 */
function link(subjectKind, subjectId, linkType, value, source, confidence) {
  return {
    subject_kind: subjectKind,
    subject_id: subjectId,
    link_type: linkType,
    link_value: String(value),
    source,
    confidence,
  };
}

function sessionWorkLinks(sessionId, summary) {
  const rows = [];
  for (const invocation of summary.commands) {
    rows.push(link("session", sessionId, "workflow", invocation.command, "command-name", "exact"));
    const issue = invocation.args?.match(/\bLAN-\d+\b/i)?.[0];
    if (issue) {
      rows.push(link("session", sessionId, "issue", issue.toUpperCase(), "command-args", "exact"));
    }
  }
  if (summary.pr_number !== null) {
    rows.push(link("session", sessionId, "pr", summary.pr_number, "pr-link", "exact"));
  }
  for (const branch of summary.git_branches) {
    rows.push(link("session", sessionId, "branch", branch, "git-branch", "exact"));
    const issue = branch.match(BRANCH_ISSUE);
    if (issue) {
      rows.push(link("session", sessionId, "issue", `LAN-${issue[1]}`, "git-branch", "exact"));
    }
  }
  for (const issue of summary.issue_mentions) {
    rows.push(link("session", sessionId, "issue", issue, "text-mention", "mention"));
  }
  return rows;
}

/* ------------------------------------------------------------------ *
 * Subagent runs
 * ------------------------------------------------------------------ */

async function extractAgentRuns(sessionDir, sessionId) {
  const subagentsDir = join(sessionDir, "subagents");
  if (!existsSync(subagentsDir)) return { runs: [], requests: [], links: [] };

  const runs = [];
  const requests = [];
  const links = [];

  for (const entry of readdirSync(subagentsDir).sort()) {
    if (!entry.endsWith(".meta.json")) continue;
    const agentId = entry.replace(/\.meta\.json$/, "");
    const meta = readJsonIfPresent(join(subagentsDir, entry), {});
    const transcriptPath = join(subagentsDir, `${agentId}.jsonl`);

    let summary = null;
    if (existsSync(transcriptPath)) {
      const extracted = await extractTranscript(transcriptPath, {
        subjectKind: "agent_run",
        subjectId: agentId,
      });
      summary = extracted.summary;
      requests.push(...extracted.requests);
    }

    runs.push({
      agent_id: agentId,
      parent_session_id: sessionId,
      agent_type: meta.agentType ?? null,
      description: meta.description ?? null,
      worktree_path: meta.worktreePath ?? null,
      worktree_branch: meta.worktreeBranch ?? null,
      spawned_with_worktree: meta.spawnedWithWorktree ?? null,
      worktree_cleanly_removed: meta.worktreeCleanlyRemoved ?? null,
      tool_use_id: meta.toolUseId ?? null,
      spawn_depth: meta.spawnDepth ?? null,
      has_transcript: summary !== null,
      started_at: summary?.started_at ?? null,
      ended_at: summary?.ended_at ?? null,
      models: summary?.models ?? [],
      user_turns: summary?.user_turns ?? 0,
      requests: summary?.requests ?? 0,
      tool_calls: summary?.tool_calls ?? 0,
      tool_histogram: summary?.tool_histogram ?? {},
      usage: summary?.usage ?? emptyUsage(),
    });

    links.push(link("agent_run", agentId, "parent_session", sessionId, "subagent-dir", "exact"));
    if (meta.agentType) {
      links.push(link("agent_run", agentId, "role", meta.agentType, "subagent-meta", "exact"));
    }
    if (meta.worktreeBranch) {
      links.push(
        link("agent_run", agentId, "branch", meta.worktreeBranch, "subagent-meta", "exact"),
      );
      const issue = meta.worktreeBranch.match(BRANCH_ISSUE);
      if (issue) {
        links.push(
          link("agent_run", agentId, "issue", `LAN-${issue[1]}`, "subagent-meta", "exact"),
        );
      }
    }
  }

  return { runs, requests, links };
}

/* ------------------------------------------------------------------ *
 * Mission journals
 * ------------------------------------------------------------------ */

/**
 * Copies each mission journal verbatim and derives the link rows that tie a
 * mission package to the subagent that implemented it.
 *
 * The join is exact and needs no new instrumentation: a `worker-dispatched`
 * event records `worktree: .../.claude/worktrees/agent-<id>`, and that same
 * `agent-<id>` is the filename of the subagent transcript under the Lead
 * session's `subagents/` directory.
 */
function harvestMissions(outDir, manifest, options, report) {
  const paths = missionPaths(repoRoot, null);
  if (!existsSync(paths.missionsRoot)) return;

  for (const missionId of readdirSync(paths.missionsRoot).sort()) {
    const journalPath = join(paths.missionsRoot, missionId, "journal.ndjson");
    if (!existsSync(journalPath)) continue;

    const stats = statSync(journalPath);
    const fingerprint = `${stats.mtimeMs}:${stats.size}:${EXTRACTOR_VERSION}`;
    report.scanned += 1;
    if (!options.force && manifest.sources[journalPath] === fingerprint) continue;
    report.changed += 1;

    const events = [];
    const links = [];
    for (const line of readFileSync(journalPath, "utf8").split("\n")) {
      if (!line.trim()) continue;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      events.push({ mission_id: missionId, ...event });

      if (event.type === "worker-dispatched" && event.worktree) {
        const agentId = basename(event.worktree);
        links.push(link("agent_run", agentId, "mission", missionId, "journal", "exact"));
        if (event.package_id) {
          links.push(link("agent_run", agentId, "package", event.package_id, "journal", "exact"));
        }
        if (event.worker_id) {
          links.push(link("agent_run", agentId, "worker", event.worker_id, "journal", "exact"));
        }
        if (event.branch) {
          links.push(link("agent_run", agentId, "branch", event.branch, "journal", "exact"));
          const issue = event.branch.match(BRANCH_ISSUE);
          if (issue) {
            links.push(link("agent_run", agentId, "issue", `LAN-${issue[1]}`, "journal", "exact"));
          }
        }
      }
    }

    report.missionEvents += events.length;
    if (options.dryRun) continue;

    writeNdjson(join(outDir, "data", "mission_events", `${missionId}.ndjson`), events);
    writeNdjson(join(outDir, "data", "work_links", `mission-${missionId}.ndjson`), links);
    manifest.sources[journalPath] = fingerprint;
  }
}

/* ------------------------------------------------------------------ *
 * Output repository
 * ------------------------------------------------------------------ */

function git(outDir, args) {
  return execFileSync("git", ["-C", outDir, ...args], { encoding: "utf8" }).trim();
}

/**
 * Refuses to push anywhere but the private telemetry repository. Derived rows
 * carry no message text, but a misconfigured remote here would still publish
 * the shape of every private session into whatever repository it pointed at.
 */
function assertSafeRemote(outDir) {
  let remote;
  try {
    remote = git(outDir, ["remote", "get-url", "origin"]);
  } catch {
    throw new Error(`${outDir} has no origin remote; refusing to push`);
  }
  if (!EXPECTED_REMOTE.test(remote)) {
    throw new Error(`refusing to push telemetry to unexpected remote: ${remote}`);
  }
}

function bootstrapOutputRepo(outDir) {
  mkdirSync(join(outDir, "data"), { recursive: true });
  const readme = join(outDir, "README.md");
  if (existsSync(readme)) return;
  writeAtomic(
    readme,
    [
      "# agent-telemetry",
      "",
      "Derived telemetry from Claude Code sessions on this machine. Written by",
      "`scripts/telemetry/harvest.mjs` in the lancers-operations-platform repo.",
      "",
      "Rows are counts, identifiers and timestamps. No conversation text is stored.",
      "See `docs/agent-telemetry.md` in that repo for the tables.",
      "",
      "Private by design. Do not make this repository public.",
      "",
    ].join("\n"),
  );
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

async function harvestSessions(options, manifest, report, outDir) {
  if (!existsSync(options.projectsRoot)) return;

  for (const projectDir of readdirSync(options.projectsRoot).sort()) {
    const projectPath = join(options.projectsRoot, projectDir);
    if (!statSync(projectPath).isDirectory()) continue;

    for (const entry of readdirSync(projectPath).sort()) {
      if (!entry.endsWith(".jsonl")) continue;
      const transcriptPath = join(projectPath, entry);
      const sessionId = entry.replace(/\.jsonl$/, "");
      const stats = statSync(transcriptPath);
      const fingerprint = `${stats.mtimeMs}:${stats.size}:${EXTRACTOR_VERSION}`;

      report.scanned += 1;
      if (!options.force && manifest.sources[transcriptPath] === fingerprint) continue;
      report.changed += 1;

      const { summary, requests } = await extractTranscript(transcriptPath, {
        subjectKind: "session",
        subjectId: sessionId,
      });
      const agents = await extractAgentRuns(join(projectPath, sessionId), sessionId);

      report.sessions += 1;
      report.agentRuns += agents.runs.length;
      report.requests += requests.length + agents.requests.length;
      if (options.dryRun) continue;

      // Everything this session is responsible for: its own messages plus the
      // subagents it spawned. This is the figure the recorded rollup should be
      // comparable to, so the delta between them is stored rather than hidden.
      const attributed = emptyUsage();
      addUsage(attributed, summary.usage);
      for (const run of agents.runs) addUsage(attributed, run.usage);

      const session = {
        session_id: sessionId,
        project_dir: projectDir,
        source_bytes: stats.size,
        source_mtime: new Date(stats.mtimeMs).toISOString(),
        harvested_at: new Date().toISOString(),
        agent_run_count: agents.runs.length,
        ...summary,
        attributed_usage: attributed,
        usage_reconciliation: summary.recorded_usage
          ? {
              derived_output_tokens: attributed.output_tokens,
              recorded_output_tokens: summary.recorded_usage.totals.output_tokens,
              derived_cache_read_tokens: attributed.cache_read_input_tokens,
              recorded_cache_read_tokens: summary.recorded_usage.totals.cache_read_input_tokens,
              agrees: attributed.output_tokens === summary.recorded_usage.totals.output_tokens,
            }
          : null,
      };

      writeAtomic(
        join(outDir, "data", "sessions", `${sessionId}.json`),
        `${JSON.stringify(session, null, 2)}\n`,
      );
      writeNdjson(join(outDir, "data", "requests", `${sessionId}.ndjson`), [
        ...requests,
        ...agents.requests,
      ]);
      writeNdjson(join(outDir, "data", "agent_runs", `${sessionId}.ndjson`), agents.runs);
      writeNdjson(join(outDir, "data", "work_links", `${sessionId}.ndjson`), [
        ...sessionWorkLinks(sessionId, summary),
        ...agents.links,
      ]);
      manifest.sources[transcriptPath] = fingerprint;
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }

  const startedAt = Date.now();
  const outDir = options.out;
  if (!options.dryRun) bootstrapOutputRepo(outDir);

  const manifestPath = join(outDir, "manifest.json");
  const manifest = readJsonIfPresent(manifestPath, {
    version: EXTRACTOR_VERSION,
    sources: {},
  });
  if (manifest.version !== EXTRACTOR_VERSION) {
    manifest.version = EXTRACTOR_VERSION;
    manifest.sources = {};
  }

  const report = {
    scanned: 0,
    changed: 0,
    sessions: 0,
    agentRuns: 0,
    requests: 0,
    missionEvents: 0,
  };

  await harvestSessions(options, manifest, report, outDir);
  harvestMissions(outDir, manifest, options, report);

  const line =
    `${new Date().toISOString()} scanned=${report.scanned} changed=${report.changed} ` +
    `sessions=${report.sessions} agent_runs=${report.agentRuns} ` +
    `requests=${report.requests} mission_events=${report.missionEvents} ` +
    `duration_ms=${Date.now() - startedAt}`;

  if (options.dryRun) {
    process.stdout.write(`${line} (dry run, nothing written)\n`);
    return;
  }

  writeAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  appendFileSync(join(outDir, "harvest.log"), `${line}\n`);
  process.stdout.write(`${line}\n`);

  if (!options.git || report.changed === 0) return;

  assertSafeRemote(outDir);
  git(outDir, ["add", "-A"]);
  if (!git(outDir, ["status", "--porcelain"])) return;
  git(outDir, ["commit", "-m", `harvest ${new Date().toISOString().slice(0, 10)}`]);
  try {
    git(outDir, ["push"]);
  } catch (error) {
    // A failed push is not a failed harvest: the commit is durable locally and
    // the next run carries it forward.
    process.stderr.write(`push deferred: ${error.message.split("\n")[0]}\n`);
  }
}

// Only run when invoked as a command. Importing this module — which the tests
// do, to exercise the extractor against fixtures — must not start a harvest.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

export { extractTranscript, extractAgentRuns, sessionWorkLinks, recordedUsage, main };
