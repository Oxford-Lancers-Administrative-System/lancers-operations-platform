import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  extractAgentRuns,
  extractTranscript,
  main,
  sessionWorkLinks,
} from "../scripts/telemetry/harvest.mjs";

/**
 * These pin the three rules that are easy to get wrong and expensive to get
 * wrong quietly: how repeated usage blocks are counted, how a subagent's own
 * tokens are attributed, and that a source disappearing never removes the rows
 * already derived from it.
 */

const temporaries: string[] = [];

function scratch(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "telemetry-test-"));
  temporaries.push(dir);
  return dir;
}

afterEach(() => {
  while (temporaries.length) {
    fs.rmSync(temporaries.pop() as string, { recursive: true, force: true });
  }
});

function assistant(
  requestId: string,
  usage: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    type: "assistant",
    uuid: `${requestId}-${Math.random()}`,
    requestId,
    timestamp: "2026-08-30T10:00:00.000Z",
    sessionId: "s1",
    cwd: "/repo",
    gitBranch: "feat/lan-42-thing",
    message: { model: "claude-opus-5", usage, content: [] },
    ...extra,
  });
}

const USAGE = {
  input_tokens: 10,
  output_tokens: 100,
  cache_read_input_tokens: 1000,
  cache_creation_input_tokens: 50,
  output_tokens_details: { thinking_tokens: 7 },
};

function writeTranscript(dir: string, name: string, lines: string[]): string {
  const file = path.join(dir, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${lines.join("\n")}\n`);
  return file;
}

describe("request deduplication", () => {
  it("counts a repeated usage block once per request id", async () => {
    const dir = scratch();
    // Claude Code emits several assistant records for one request, each
    // repeating the same usage. Summing per record would treble this.
    const file = writeTranscript(dir, "s1.jsonl", [
      assistant("req_a", USAGE),
      assistant("req_a", USAGE),
      assistant("req_a", USAGE),
      assistant("req_b", USAGE),
    ]);

    const { summary, requests } = await extractTranscript(file, {
      subjectKind: "session",
      subjectId: "s1",
    });

    expect(requests).toHaveLength(2);
    expect(summary.usage.output_tokens).toBe(200);
    expect(summary.usage.cache_read_input_tokens).toBe(2000);
    expect(summary.usage.thinking_tokens).toBe(14);
    // Every record is still counted for volume, only usage is deduplicated.
    expect(summary.assistant_records).toBe(4);
  });

  it("takes the final output count when records for one request grow", async () => {
    const dir = scratch();
    // output_tokens grows across the records of one request as the response
    // streams, while the input and cache fields repeat unchanged. Keeping the
    // first record here would report 5 instead of 900 — the shape of the 7.2x
    // undercount this replaces.
    const file = writeTranscript(dir, "s1.jsonl", [
      assistant("req_a", { ...USAGE, output_tokens: 5 }),
      assistant("req_a", { ...USAGE, output_tokens: 240 }),
      assistant("req_a", { ...USAGE, output_tokens: 900 }),
    ]);

    const { summary, requests } = await extractTranscript(file, {
      subjectKind: "session",
      subjectId: "s1",
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].output_tokens).toBe(900);
    expect(summary.usage.output_tokens).toBe(900);
    // The constant fields must not be multiplied by the collapse.
    expect(summary.usage.cache_read_input_tokens).toBe(1000);
    expect(summary.usage.input_tokens).toBe(10);
  });
});

describe("sidechain attribution", () => {
  it("keeps inlined sidechain usage out of a session's own totals", async () => {
    const dir = scratch();
    const file = writeTranscript(dir, "s1.jsonl", [
      assistant("req_main", USAGE),
      assistant("req_side", USAGE, { isSidechain: true }),
    ]);

    const { summary } = await extractTranscript(file, {
      subjectKind: "session",
      subjectId: "s1",
    });

    expect(summary.usage.output_tokens).toBe(100);
    expect(summary.sidechain_usage.output_tokens).toBe(100);
  });

  it("counts a subagent's own records despite their sidechain flag", async () => {
    // Every record in a subagent transcript is flagged isSidechain, because
    // from the parent's point of view the whole file is sidechain traffic.
    // Splitting on the flag here would report the run as zero tokens.
    const dir = scratch();
    const file = writeTranscript(dir, "agent-a1.jsonl", [
      assistant("req_1", USAGE, { isSidechain: true }),
      assistant("req_2", USAGE, { isSidechain: true }),
    ]);

    const { summary } = await extractTranscript(file, {
      subjectKind: "agent_run",
      subjectId: "agent-a1",
    });

    expect(summary.usage.output_tokens).toBe(200);
    expect(summary.sidechain_usage.output_tokens).toBe(0);
  });

  it("attributes a subagent run to its role and branch", async () => {
    const dir = scratch();
    const subagents = path.join(dir, "s1", "subagents");
    fs.mkdirSync(subagents, { recursive: true });
    fs.writeFileSync(
      path.join(subagents, "agent-a1.meta.json"),
      JSON.stringify({
        agentType: "implementation-worker",
        description: "Do the thing",
        worktreeBranch: "feat/lan-169-messaging-foundation",
        spawnDepth: 1,
      }),
    );
    fs.writeFileSync(
      path.join(subagents, "agent-a1.jsonl"),
      `${assistant("req_1", USAGE, { isSidechain: true })}\n`,
    );

    const { runs, links } = await extractAgentRuns(path.join(dir, "s1"), "s1");

    expect(runs).toHaveLength(1);
    expect(runs[0].agent_type).toBe("implementation-worker");
    expect(runs[0].usage.output_tokens).toBe(100);
    expect(links).toContainEqual(
      expect.objectContaining({ link_type: "role", link_value: "implementation-worker" }),
    );
    expect(links).toContainEqual(
      expect.objectContaining({ link_type: "issue", link_value: "LAN-169" }),
    );
  });
});

describe("work links", () => {
  it("separates an exact issue link from a passing mention", async () => {
    const dir = scratch();
    const file = writeTranscript(dir, "s1.jsonl", [
      assistant("req_a", USAGE),
      JSON.stringify({
        type: "user",
        uuid: "u1",
        timestamp: "2026-08-30T10:00:00.000Z",
        message: { content: "<command-name>/start-issue</command-name>\nalso saw LAN-999" },
      }),
    ]);

    const { summary } = await extractTranscript(file, {
      subjectKind: "session",
      subjectId: "s1",
    });
    const links = sessionWorkLinks("s1", summary);

    // The branch names LAN-42, so that is exact; LAN-999 was only mentioned.
    expect(links).toContainEqual(
      expect.objectContaining({ link_type: "issue", link_value: "LAN-42", confidence: "exact" }),
    );
    expect(links).toContainEqual(
      expect.objectContaining({
        link_type: "issue",
        link_value: "LAN-999",
        confidence: "mention",
      }),
    );
    expect(links).toContainEqual(
      expect.objectContaining({ link_type: "workflow", link_value: "/start-issue" }),
    );
  });
});

describe("durability", () => {
  it("keeps derived rows after the source transcript is gone", async () => {
    const projects = scratch();
    const out = scratch();
    const projectDir = path.join(projects, "-repo");
    fs.mkdirSync(projectDir, { recursive: true });
    const transcript = path.join(projectDir, "s1.jsonl");
    fs.writeFileSync(transcript, `${assistant("req_a", USAGE)}\n`);

    const argv = process.argv;
    const missionRoot = process.env.LANCERS_MISSION_ROOT;
    // Point the journal reader at an empty root so the test never depends on
    // whichever missions happen to exist on the machine running it.
    process.env.LANCERS_MISSION_ROOT = scratch();
    process.argv = ["node", "harvest", "--projects", projects, "--out", out, "--no-git"];
    try {
      await main();
      expect(fs.existsSync(path.join(out, "data", "sessions", "s1.json"))).toBe(true);

      // The retention timer removes the source; the next harvest must not
      // remove what was already derived from it.
      fs.rmSync(transcript);
      await main();
    } finally {
      process.argv = argv;
      if (missionRoot === undefined) delete process.env.LANCERS_MISSION_ROOT;
      else process.env.LANCERS_MISSION_ROOT = missionRoot;
    }

    const session = JSON.parse(
      fs.readFileSync(path.join(out, "data", "sessions", "s1.json"), "utf8"),
    );
    expect(session.usage.output_tokens).toBe(100);
  });
});
