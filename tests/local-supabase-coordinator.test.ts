import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  LEASE_TTL_MS,
  SLOT_DEFINITIONS,
  acquireLease as acquireLeaseRaw,
  coordinatorStatus,
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
};
const acquireLease = (input: AcquireInput) =>
  acquireLeaseRaw({ ...input, portProbe: async () => false });

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lancers-coordinator-"));
  temporary.push(root);
  const state = path.join(root, "state");
  const repo = path.join(root, "repo");
  fs.mkdirSync(path.join(repo, "supabase", "migrations"), { recursive: true });
  fs.writeFileSync(path.join(repo, "supabase", "seed.sql"), "-- synthetic\n");
  fs.writeFileSync(
    path.join(repo, "supabase", "config.toml"),
    'project_id = "tracked"\n[api]\nport = 54321\n[db]\nport = 54322\nshadow_port = 54320\n[db.pooler]\nport = 54329\n[studio]\nport = 54323\n[local_smtp]\nport = 54324\n[auth]\nsite_url = "http://localhost:3000"\nadditional_redirect_urls = ["http://localhost:3000"]\n[analytics]\nport = 54327\n',
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

  it("refuses missing and invalid ownership tokens before mutation", async () => {
    const { repo, env } = fixture();
    await expect(updateLease({ repoPath: repo, token: "", env })).rejects.toThrow(
      /missing, invalid, or stale/i,
    );
    await expect(updateLease({ repoPath: repo, token: "not-the-owner", env })).rejects.toThrow(
      /missing, invalid, or stale/i,
    );
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
    expect(fs.readFileSync(path.join(repo, "supabase", "config.toml"), "utf8")).toContain(
      'project_id = "tracked"',
    );
  });
});
