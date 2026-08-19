import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  LEASE_TTL_MS,
  SLOT_DEFINITIONS,
  acquireLease as acquireLeaseRaw,
  acquireMissionLease,
  attachMissionLease,
  coordinatorStatus,
  findOwningSessionPid,
  releaseLease,
  updateLease,
} from "../scripts/lib/local-supabase-coordinator.mjs";

const temporary: string[] = [];
type AcquireInput = {
  issueId: string;
  repoPath: string;
  pid?: number;
  now?: number;
  env?: NodeJS.ProcessEnv;
  probe?: (pid: number, signal: number) => unknown;
  portProbe?: (port: number) => Promise<boolean>;
};
const acquireLease = (input: AcquireInput) =>
  acquireLeaseRaw({ portProbe: async () => false, ...input });

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lancers-coordinator-"));
  temporary.push(root);
  const state = path.join(root, "state");
  const repo = path.join(root, "repo");
  fs.mkdirSync(path.join(repo, "supabase", "migrations"), { recursive: true });
  fs.writeFileSync(path.join(repo, "supabase", "seed.sql"), "-- synthetic\n");
  fs.mkdirSync(path.join(repo, "supabase", "templates"), { recursive: true });
  fs.writeFileSync(
    path.join(repo, "supabase", "templates", "recovery.html"),
    '<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=recovery">reset</a>\n',
  );
  fs.writeFileSync(
    path.join(repo, "supabase", "config.toml"),
    'project_id = "tracked"\n[api]\nport = 54321\n[db]\nport = 54322\nshadow_port = 54320\n[db.pooler]\nport = 54329\n[studio]\nport = 54323\n[local_smtp]\nport = 54324\n[edge_runtime]\nenabled = true\ninspector_port = 8083\n[auth]\nsite_url = "http://localhost:3000"\nadditional_redirect_urls = ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3000/auth/recovery", "http://127.0.0.1:3000/auth/recovery"]\n[analytics]\nport = 54327\n',
  );
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["remote", "add", "origin", "git@example.test:oxford/lancers.git"], {
    cwd: repo,
  });
  return { repo, env: { ...process.env, LANCERS_COORDINATOR_ROOT: state } };
}

afterEach(() => {
  for (const root of temporary.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("two-slot local Supabase coordinator", () => {
  const dead = () => {
    const error = Object.assign(new Error("missing"), { code: "ESRCH" });
    throw error;
  };

  it("binds ownership to the live Claude or Codex session ancestor", () => {
    const processes = new Map([
      [10, { ppid: 20, command: "node" }],
      [20, { ppid: 30, command: "npm" }],
      [30, { ppid: 1, command: "/usr/local/bin/claude" }],
    ]);
    expect(findOwningSessionPid(10, (pid) => processes.get(pid)!)).toBe(30);
  });

  it("finds Codex too, and refuses lookup denial or a chain with no agent session", () => {
    const codex = new Map([
      [10, { ppid: 20, command: "node" }],
      [20, { ppid: 1, command: "/Applications/Codex.app/codex" }],
    ]);
    expect(findOwningSessionPid(10, (pid) => codex.get(pid)!)).toBe(20);
    expect(() =>
      findOwningSessionPid(10, () => {
        throw new Error("denied");
      }),
    ).toThrow(/refusing to acquire/i);
    expect(() =>
      findOwningSessionPid(10, (pid) =>
        pid === 10 ? { ppid: 20, command: "node" } : { ppid: 1, command: "zsh" },
      ),
    ).toThrow(/refusing to acquire/i);
  });

  it("atomically gives simultaneous claimants different slots", async () => {
    const { repo, env } = fixture();
    const [first, second] = await Promise.all([
      acquireLease({ issueId: "LAN-1", repoPath: repo, pid: 101, env, probe: () => true }),
      acquireLease({ issueId: "LAN-2", repoPath: repo, pid: 102, env, probe: () => true }),
    ]);
    expect(new Set([first?.slot, second?.slot])).toEqual(new Set(["primary", "overflow"]));
  });

  it("uses overflow while primary is live and refuses a third claimant", async () => {
    const { repo, env } = fixture();
    const primary = await acquireLease({
      issueId: "LAN-1",
      repoPath: repo,
      pid: 101,
      env,
      probe: () => true,
    });
    const overflow = await acquireLease({
      issueId: "LAN-2",
      repoPath: repo,
      pid: 102,
      env,
      probe: () => true,
    });
    const third = await acquireLease({
      issueId: "LAN-3",
      repoPath: repo,
      pid: 103,
      env,
      probe: () => true,
    });
    expect(primary?.slot).toBe("primary");
    expect(overflow?.slot).toBe("overflow");
    expect(third).toBeNull();
  });

  it("treats an unregistered process on a primary port as uncertain and uses overflow", async () => {
    const { repo, env } = fixture();
    const primaryPorts = new Set(Object.values(SLOT_DEFINITIONS[0].ports));
    const lease = await acquireLeaseRaw({
      issueId: "LAN-1",
      repoPath: repo,
      pid: 101,
      env,
      probe: () => true,
      portProbe: async (port: number) => primaryPorts.has(port),
    });
    expect(lease?.slot).toBe("overflow");
  });

  it("uses overflow when only the primary edge inspector port is occupied", async () => {
    const { repo, env } = fixture();
    const lease = await acquireLeaseRaw({
      issueId: "LAN-1",
      repoPath: repo,
      pid: 101,
      env,
      probe: () => true,
      portProbe: async (port: number) => port === SLOT_DEFINITIONS[0].ports.inspector,
    });
    expect(lease?.slot).toBe("overflow");
  });

  it("reclaims only a dead owner whose heartbeat expired and rotates its fence", async () => {
    const { repo, env } = fixture();
    const old = await acquireLease({
      issueId: "LAN-1",
      repoPath: repo,
      pid: 101,
      now: 1_000,
      env,
      probe: dead,
    });
    const replacement = await acquireLease({
      issueId: "LAN-2",
      repoPath: repo,
      pid: 102,
      now: 1_000 + LEASE_TTL_MS + 1,
      env,
      probe: dead,
    });
    expect(replacement?.slot).toBe(old?.slot);
    expect(replacement?.token).not.toBe(old?.token);
    await expect(updateLease({ repoPath: repo, token: old!.token, env })).rejects.toThrow(
      /invalid, or stale/i,
    );
  });

  it("does not reclaim a live or uncertain owner", async () => {
    const { repo, env } = fixture();
    await acquireLease({
      issueId: "LAN-1",
      repoPath: repo,
      pid: 101,
      now: 1_000,
      env,
      probe: () => true,
    });
    await acquireLease({
      issueId: "LAN-2",
      repoPath: repo,
      pid: 102,
      now: 1_000,
      env,
      probe: () => {
        const error = Object.assign(new Error("denied"), { code: "EPERM" });
        throw error;
      },
    });
    expect(
      await acquireLease({
        issueId: "LAN-3",
        repoPath: repo,
        pid: 103,
        now: 1_000 + LEASE_TTL_MS + 1,
        env,
        probe: () => true,
      }),
    ).toBeNull();
  });

  it("protects review-ready stacks until their owner explicitly releases them", async () => {
    const { repo, env } = fixture();
    const lease = await acquireLease({
      issueId: "LAN-1",
      repoPath: repo,
      pid: process.pid,
      now: 1_000,
      env,
    });
    await updateLease({
      repoPath: repo,
      token: lease!.token,
      state: "review-ready",
      now: 1_000,
      env,
    });
    const second = await acquireLease({
      issueId: "LAN-2",
      repoPath: repo,
      pid: 102,
      now: 1_000 + LEASE_TTL_MS + 1,
      env,
      probe: dead,
    });
    expect(second?.slot).toBe("overflow");
    expect(coordinatorStatus(repo, env).slots.primary.state).toBe("review-ready");
    await releaseLease({ repoPath: repo, token: lease!.token, env });
  });

  it("re-fences a released slot even when its known local containers are still running", async () => {
    const { repo, env } = fixture();
    const first = await acquireLease({ issueId: "LAN-1", repoPath: repo, pid: 101, env });
    await releaseLease({ repoPath: repo, token: first!.token, env });

    const second = await acquireLease({
      issueId: "LAN-2",
      repoPath: repo,
      pid: 102,
      env,
      portProbe: async () => true,
    });

    expect(second?.slot).toBe("primary");
    expect(second?.token).not.toBe(first?.token);
    await expect(updateLease({ repoPath: repo, token: first!.token, env })).rejects.toThrow(
      /missing, invalid, or stale/i,
    );
  });

  it("refuses missing and invalid ownership tokens before mutation", async () => {
    const { repo, env } = fixture();
    await expect(updateLease({ repoPath: repo, token: "", env })).rejects.toThrow(
      /missing, invalid, or stale/i,
    );
    await expect(updateLease({ repoPath: repo, token: "not-the-owner", env })).rejects.toThrow(
      /missing, invalid, or stale/i,
    );
  });

  it("refuses a valid token presented from another worktree of the same repository", async () => {
    const { repo, env } = fixture();
    const secondWorktree = path.join(path.dirname(repo), "other-worktree");
    fs.cpSync(repo, secondWorktree, { recursive: true });
    const lease = await acquireLease({ issueId: "LAN-1", repoPath: repo, pid: 101, env });
    await expect(
      updateLease({ repoPath: secondWorktree, token: lease!.token, env }),
    ).rejects.toThrow(/missing, invalid, or stale/i);
  });

  it("generates distinct complete port sets and untracked runtime configuration", async () => {
    const { repo, env } = fixture();
    const first = await acquireLease({
      issueId: "LAN-1",
      repoPath: repo,
      pid: 101,
      env,
      probe: () => true,
    });
    const second = await acquireLease({
      issueId: "LAN-2",
      repoPath: repo,
      pid: 102,
      env,
      probe: () => true,
    });
    expect(first?.projectId).not.toBe(second?.projectId);
    expect(first?.applicationPort).not.toBe(second?.applicationPort);
    for (const service of Object.keys(SLOT_DEFINITIONS[0].ports)) {
      expect(first?.ports[service]).not.toBe(second?.ports[service]);
    }
    expect(
      fs.readFileSync(path.join(first!.runtimeRoot, "supabase", "config.toml"), "utf8"),
    ).toContain(first!.projectId);
    expect(
      fs.readFileSync(path.join(second!.runtimeRoot, "supabase", "config.toml"), "utf8"),
    ).toContain(`inspector_port = ${second!.ports.inspector}`);
    expect(fs.readFileSync(path.join(repo, "supabase", "config.toml"), "utf8")).toContain(
      'project_id = "tracked"',
    );
  });
});

describe("mission-owned local Supabase stacks", () => {
  it("allocates concurrent missions without a fixed slot ceiling", async () => {
    const { repo, env } = fixture();
    const stacks = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        acquireMissionLease({
          missionId: `M-CONCURRENT-${index}`,
          repoPath: repo,
          baseCommit: "a".repeat(40),
          migrationHead: 20260819000000,
          pid: 200 + index,
          env,
          portProbe: async () => false,
        }),
      ),
    );
    expect(new Set(stacks.map((stack) => stack.slot)).size).toBe(5);
    expect(new Set(stacks.map((stack) => stack.projectId)).size).toBe(5);
    expect(new Set(stacks.flatMap((stack) => Object.values(stack.ports))).size).toBe(40);
  });

  it("attaches a worker worktree to its mission and rejects another mission", async () => {
    const { repo, env } = fixture();
    const lease = await acquireMissionLease({
      missionId: "M-ATTACH",
      repoPath: repo,
      baseCommit: "b".repeat(40),
      migrationHead: 20260819000000,
      env,
      portProbe: async () => false,
    });
    const worker = path.join(path.dirname(repo), "worker");
    fs.cpSync(repo, worker, { recursive: true });
    const attached = await attachMissionLease({
      missionId: "M-ATTACH",
      repoPath: worker,
      token: lease.token,
      env,
    });
    expect(attached.attachedRepoPaths).toContain(fs.realpathSync(worker));
    await expect(
      attachMissionLease({ missionId: "M-OTHER", repoPath: worker, token: lease.token, env }),
    ).rejects.toThrow(/mismatched mission/i);
  });
});

/**
 * LAN-125. Two things the recovery flow depends on, and both fail silently.
 *
 * The rendered config used to replace the whole redirect line with a fixed pair
 * of bare origins, which would have dropped the exact `/auth/recovery` entries
 * the tracked config lists. Supabase substitutes its Site URL for a destination
 * it does not recognise, so the symptom is not an error: every recovery email
 * lands on the sign-in page instead of the reset page. The template link is the
 * same shape of failure — without it Supabase sends its own email, which the
 * application cannot complete.
 */
describe("the rendered slot config keeps what password recovery needs", () => {
  async function renderedFor(pid: number) {
    const { repo, env } = fixture();
    const lease = await acquireLease({
      issueId: `LAN-${pid}`,
      repoPath: repo,
      pid,
      env,
      probe: () => true,
    });
    return {
      repo,
      lease: lease!,
      config: fs.readFileSync(path.join(lease!.runtimeRoot, "supabase", "config.toml"), "utf8"),
    };
  }

  it("re-ports every allow-listed URL and keeps its path", async () => {
    const { lease, config } = await renderedFor(201);
    const line = /^additional_redirect_urls = (.+)$/m.exec(config)![1];
    const urls = JSON.parse(line) as string[];

    expect(urls).toEqual([
      `http://localhost:${lease.applicationPort}`,
      `http://127.0.0.1:${lease.applicationPort}`,
      `http://localhost:${lease.applicationPort}/auth/recovery`,
      `http://127.0.0.1:${lease.applicationPort}/auth/recovery`,
    ]);
  });

  it("re-ports the same way for whichever slot is assigned", async () => {
    const { repo, env } = fixture();
    const primary = await acquireLease({
      issueId: "LAN-1",
      repoPath: repo,
      pid: 301,
      env,
      probe: () => true,
    });
    const overflow = await acquireLease({
      issueId: "LAN-2",
      repoPath: repo,
      pid: 302,
      env,
      probe: () => true,
    });

    for (const lease of [primary!, overflow!]) {
      const config = fs.readFileSync(
        path.join(lease.runtimeRoot, "supabase", "config.toml"),
        "utf8",
      );
      expect(config).toContain(`"http://127.0.0.1:${lease.applicationPort}/auth/recovery"`);
      expect(config).toContain(`site_url = "http://localhost:${lease.applicationPort}"`);
    }
    expect(primary!.applicationPort).not.toBe(overflow!.applicationPort);
  });

  it("links the email templates beside the migrations, so content_path resolves", async () => {
    const { lease } = await renderedFor(203);
    const linked = path.join(lease.runtimeRoot, "supabase", "templates", "recovery.html");

    expect(fs.existsSync(linked)).toBe(true);
    expect(fs.readFileSync(linked, "utf8")).toContain("{{ .TokenHash }}");
  });
});
