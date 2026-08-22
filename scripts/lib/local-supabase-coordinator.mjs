import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { execFileSync } from "node:child_process";

/**
 * How long a lease may go unrefreshed before another session may reclaim it.
 *
 * LAN-148: reclaim is heartbeat-driven rather than process-driven. Every agent
 * in one Claude session shares that session's process, so a live pid proves
 * nothing about whether the agent that took the lease still exists — see
 * `reclaimable`.
 *
 * The window is long on purpose. Heartbeats are still refreshed by hand, by
 * whichever guarded database command happens to run next, so an agent that
 * spends an hour on a build or waiting for Brian is genuinely working and must
 * not lose its stack. A conclusively dead owning process is reclaimed at once
 * and does not wait this out; the window only covers the case the pid cannot
 * decide. A `review-ready` stack is never reclaimed on a timer at all, and
 * `cleanup-stale` is the deliberate route for a slot known to be finished.
 *
 * Shorten this once a supervisor heartbeats continuously rather than a command
 * doing it in passing.
 */
export const LEASE_TTL_MS = 14_400_000;

/** How many mission stacks may exist before allocation refuses. A backstop
 * against a runaway loop, not an operating limit. */
export const MAX_MISSION_SLOTS = 64;

export const SLOT_DEFINITIONS = [
  {
    name: "primary",
    projectId: "lancers-operations-platform-primary",
    applicationPort: 3000,
    ports: {
      api: 54321,
      db: 54322,
      shadow: 54320,
      pooler: 54329,
      studio: 54323,
      mailpit: 54324,
      inspector: 8083,
      analytics: 54327,
    },
  },
  {
    name: "overflow",
    projectId: "lancers-operations-platform-overflow",
    applicationPort: 3010,
    ports: {
      api: 55321,
      db: 55322,
      shadow: 55320,
      pooler: 55329,
      studio: 55323,
      mailpit: 55324,
      inspector: 8183,
      analytics: 55327,
    },
  },
];

const MISSION_PORT_BASE = 56320;
const MISSION_PORT_STRIDE = 20;

/**
 * One mission stack's complete identity at `index`.
 *
 * LAN-148: the name and project id carry the index. They previously did not,
 * so every index produced the same slot name — and a registry that already
 * held a record under that name made the allocation loop below spin forever,
 * holding the allocator lock while it did.
 */
export function missionSlot(missionId, index) {
  const offset = index * MISSION_PORT_STRIDE;
  const slug = missionId.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const digest = crypto.createHash("sha256").update(`${missionId}#${index}`).digest("hex");
  return {
    name: `mission-${slug}-${index}`,
    projectId: `lancers-${slug}-${digest.slice(0, 8)}`,
    applicationPort: 3100 + index,
    ports: {
      api: MISSION_PORT_BASE + offset + 1,
      db: MISSION_PORT_BASE + offset + 2,
      shadow: MISSION_PORT_BASE + offset,
      pooler: MISSION_PORT_BASE + offset + 9,
      studio: MISSION_PORT_BASE + offset + 3,
      mailpit: MISSION_PORT_BASE + offset + 4,
      inspector: MISSION_PORT_BASE + offset + 5,
      analytics: MISSION_PORT_BASE + offset + 7,
    },
  };
}

function lookupProcess(pid) {
  const line = execFileSync("ps", ["-o", "ppid=,comm=", "-p", String(pid)], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  const match = /^(\d+)\s+(.+)$/.exec(line);
  if (!match) throw new Error(`Could not inspect process ${pid}.`);
  return { ppid: Number(match[1]), command: match[2] };
}

export function findOwningSessionPid(startPid = process.ppid, lookup = lookupProcess) {
  let pid = startPid;
  for (let depth = 0; depth < 32 && pid > 1; depth += 1) {
    let processInfo;
    try {
      processInfo = lookup(pid);
    } catch {
      throw new Error(
        "Could not positively identify the owning Claude or Codex session; refusing to acquire a local Supabase lease.",
      );
    }
    if (/(^|\/)(claude|codex)(\s|$)/i.test(processInfo.command)) return pid;
    pid = processInfo.ppid;
  }
  throw new Error(
    "Could not positively identify the owning Claude or Codex session; refusing to acquire a local Supabase lease.",
  );
}

function repositoryIdentity(repoPath) {
  try {
    return execFileSync("git", ["remote", "get-url", "origin"], {
      cwd: repoPath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return path.basename(repoPath);
  }
}

export function coordinatorPaths(repoPath, env = process.env) {
  const identity = crypto
    .createHash("sha256")
    .update(repositoryIdentity(repoPath))
    .digest("hex")
    .slice(0, 16);
  const base =
    env.LANCERS_COORDINATOR_ROOT ||
    path.join(
      env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"),
      "lancers-operations-platform",
    );
  const root = path.join(base, identity);
  return {
    root,
    registry: path.join(root, "leases.json"),
    lock: path.join(root, "allocator.lock"),
  };
}

function emptyRegistry() {
  return { version: 1, slots: {} };
}

function readRegistry(registryPath) {
  try {
    return JSON.parse(fs.readFileSync(registryPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return emptyRegistry();
    throw error;
  }
}

function writeRegistry(registryPath, registry) {
  fs.mkdirSync(path.dirname(registryPath), { recursive: true, mode: 0o700 });
  const temporary = `${registryPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(registry, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, registryPath);
}

export function ownerAlive(pid, probe = process.kill) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    probe(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    return true;
  }
}

/** A lease is demonstrably in use when its heartbeat is inside the window. */
export function leaseLive(record, now) {
  const beat = Date.parse(record?.lastHeartbeat ?? "");
  return Number.isFinite(beat) && now - beat <= LEASE_TTL_MS;
}

/**
 * Whether another session may take this slot.
 *
 * LAN-148 changed the middle rule. A dead owning process is still conclusive
 * and reclaims at once. A *live* one is not conclusive: `findOwningSessionPid`
 * records the Claude session's pid, which every agent under that session
 * shares, so the previous "expired **and** owner dead" rule meant an abandoned
 * lease was never recoverable while the editor stayed open — which is what
 * leaked slots through the first live mission. Heartbeat freshness is the only
 * honest liveness signal available, so it decides. `review-ready` is exempt on
 * purpose: it is protected until its owner releases it.
 */
function reclaimable(record, now, probe) {
  if (!record || record.state === "released" || record.state === "stale") return true;
  if (record.state === "review-ready") return false;
  if (!ownerAlive(record.owner?.pid, probe)) return true;
  return !leaseLive(record, now);
}

function portIsOccupied(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const finish = (occupied) => {
      socket.destroy();
      resolve(occupied);
    };
    socket.setTimeout(200);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

/**
 * The allocator lock. Every body passed here must be bounded and fast: it is a
 * machine-wide mutex, and LAN-148 removed the one caller that awaited network
 * probes — and, before its loop was bounded, awaited them forever — inside it.
 */
async function withAllocatorLock(paths, action) {
  fs.mkdirSync(paths.root, { recursive: true, mode: 0o700 });
  const deadline = Date.now() + 10_000;
  while (true) {
    try {
      fs.mkdirSync(paths.lock);
      break;
    } catch (error) {
      if (error.code !== "EEXIST" || Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  try {
    return await action();
  } finally {
    fs.rmdirSync(paths.lock);
  }
}

/**
 * The same URL, served by this slot's application port. Anything that will not
 * parse is passed through untouched rather than silently mangled.
 */
function reportedUrl(url, applicationPort) {
  try {
    const parsed = new URL(url);
    parsed.port = String(applicationPort);
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}

function renderConfig(source, slot) {
  let section = "";
  return source
    .split("\n")
    .map((line) => {
      const heading = /^\[([^\]]+)\]/.exec(line);
      if (heading) section = heading[1];
      if (/^project_id\s*=/.test(line)) return `project_id = "${slot.projectId}"`;
      const portBySection = {
        api: "api",
        db: "db",
        "db.pooler": "pooler",
        studio: "studio",
        local_smtp: "mailpit",
        analytics: "analytics",
      };
      if (/^port\s*=/.test(line) && portBySection[section])
        return `port = ${slot.ports[portBySection[section]]}`;
      if (section === "db" && /^shadow_port\s*=/.test(line))
        return `shadow_port = ${slot.ports.shadow}`;
      if (section === "edge_runtime" && /^inspector_port\s*=/.test(line))
        return `inspector_port = ${slot.ports.inspector}`;
      if (/^site_url\s*=/.test(line))
        return `site_url = "http://localhost:${slot.applicationPort}"`;
      // LAN-125. Re-port each allow-listed URL and keep its path. Rewriting the
      // line to a fixed pair of bare origins — which is what this did — silently
      // dropped the exact `/auth/recovery` destinations the tracked config
      // lists, and Supabase substitutes site_url for a destination it does not
      // recognise, so every recovery link would have landed on the sign-in page.
      // The tracked config stays the single source of which paths are allowed.
      if (/^additional_redirect_urls\s*=/.test(line)) {
        const urls = [...line.matchAll(/"([^"]+)"/g)].map(([, url]) =>
          reportedUrl(url, slot.applicationPort),
        );
        return `additional_redirect_urls = [${urls.map((url) => `"${url}"`).join(", ")}]`;
      }
      return line;
    })
    .join("\n");
}

export function prepareRuntime(repoPath, slot) {
  const runtimeRoot = path.join(repoPath, ".lancers-runtime", slot.name ?? slot.slot);
  const runtimeSupabase = path.join(runtimeRoot, "supabase");
  fs.mkdirSync(runtimeSupabase, { recursive: true, mode: 0o700 });
  const tracked = path.join(repoPath, "supabase");
  fs.writeFileSync(
    path.join(runtimeSupabase, "config.toml"),
    renderConfig(fs.readFileSync(path.join(tracked, "config.toml"), "utf8"), slot),
  );
  // `templates` joins the list for LAN-125: `[auth.email.template.recovery]`
  // resolves `content_path` relative to the config file, and the config file the
  // CLI reads is this generated copy. Without the link Supabase falls back to
  // its built-in recovery email, whose link shape this application cannot
  // complete — and it does so without an error.
  for (const entry of ["migrations", "seed.sql", "templates"]) {
    const target = path.join(runtimeSupabase, entry);
    fs.rmSync(target, { recursive: true, force: true });
    fs.symlinkSync(path.join(tracked, entry), target);
  }
  return runtimeRoot;
}

/**
 * A fingerprint of the configuration this slot would run with right now.
 *
 * LAN-148: `supabase start` against containers that are already up is a no-op,
 * and `db reset` rebuilds the database without restarting Auth. So a re-fenced
 * running stack keeps the previous holder's `site_url` and redirect allow-list
 * while every rendered file on disk says otherwise. Recording what was actually
 * applied, and comparing it before readiness, is what makes that visible.
 */
export function renderedConfigFingerprint(repoPath, slot) {
  const rendered = path.join(
    repoPath,
    ".lancers-runtime",
    slot.name ?? slot.slot,
    "supabase",
    "config.toml",
  );
  return crypto.createHash("sha256").update(fs.readFileSync(rendered, "utf8")).digest("hex");
}

/** @param {{issueId: string, repoPath: string, pid?: number, now?: number, env?: NodeJS.ProcessEnv, probe?: (pid: number, signal: number) => unknown, portProbe?: (port: number) => Promise<boolean>}} input */
export async function acquireLease({
  issueId,
  repoPath,
  pid = process.pid,
  now = Date.now(),
  env = process.env,
  probe = process.kill,
  portProbe = portIsOccupied,
}) {
  if (!/^LAN-\d+$/.test(issueId))
    throw new Error("A single Linear issue identifier such as LAN-112 is required.");
  const resolvedRepo = fs.realpathSync(repoPath);
  const paths = coordinatorPaths(resolvedRepo, env);

  // Probe outside the lock. There are exactly two slots, so this is bounded,
  // and holding a machine-wide mutex across network timeouts is what LAN-148
  // set out to remove.
  const occupancy = new Map();
  for (const candidate of SLOT_DEFINITIONS) {
    const occupied = await Promise.all(Object.values(candidate.ports).map(portProbe));
    occupancy.set(candidate.name, occupied.some(Boolean));
  }

  return withAllocatorLock(paths, async () => {
    const registry = readRegistry(paths.registry);
    for (const slot of SLOT_DEFINITIONS) {
      const existing = registry.slots[slot.name];
      // Resume this worktree's own lease. Identity is the issue and the
      // worktree, not the pid: every agent in one Claude session shares that
      // pid, and a restarted session would otherwise abandon its own stack.
      if (
        existing?.issueId === issueId &&
        existing.repoPath === resolvedRepo &&
        ["active", "review-ready"].includes(existing.state)
      ) {
        existing.lastHeartbeat = new Date(now).toISOString();
        writeRegistry(paths.registry, registry);
        writeSession(resolvedRepo, existing);
        return { ...existing, resumed: true };
      }
    }
    let slot;
    for (const candidate of SLOT_DEFINITIONS) {
      const previous = registry.slots[candidate.name];
      if (!reclaimable(previous, now, probe)) continue;
      // A slot this coordinator has already allocated may deliberately leave
      // its known local containers running — a released stack kept warm, or an
      // abandoned one whose owner died without stopping it. Those ports belong
      // to this slot's own project id, so re-fence it to the next owner, who
      // restarts it under their own configuration before use. Only a
      // never-allocated slot is genuinely ambiguous, and it still fails closed
      // rather than risking an unrelated process.
      //
      // LAN-148: only "released" counted here, which made recovery impossible
      // in the one case it matters — an owner that died without stopping its
      // stack, leaving the slot's own containers holding the slot's own ports.
      // Any record at all means this coordinator allocated these ports to this
      // project id; a slot with no record is the only genuinely ambiguous one.
      if (!previous && occupancy.get(candidate.name)) continue;
      slot = candidate;
      break;
    }
    if (!slot) return null;
    const token = crypto.randomBytes(32).toString("hex");
    const sessionId = crypto.randomUUID();
    const runtimeRoot = prepareRuntime(resolvedRepo, slot);
    const record = {
      issueId,
      repoPath: resolvedRepo,
      owner: { pid, sessionId, startedAt: new Date(now).toISOString() },
      token,
      lastHeartbeat: new Date(now).toISOString(),
      state: "active",
      slot: slot.name,
      projectId: slot.projectId,
      ports: slot.ports,
      applicationPort: slot.applicationPort,
      runtimeRoot,
      // A new holder has applied nothing yet. Whatever the containers are
      // running belongs to the previous one until this slot is started again.
      appliedConfig: null,
    };
    registry.slots[slot.name] = record;
    writeRegistry(paths.registry, registry);
    writeSession(resolvedRepo, record);
    return record;
  });
}

/**
 * Allocate one mission-owned stack. The allocator lock prevents duplicate
 * identities and ports; it is taken twice, briefly, with the port probes
 * between — it never limits how many missions may exist and never spans a
 * slow wait.
 */
export async function acquireMissionLease({
  missionId,
  repoPath,
  baseCommit,
  migrationHead,
  pid = process.pid,
  now = Date.now(),
  env = process.env,
  portProbe = portIsOccupied,
}) {
  if (!/^M-[A-Za-z0-9][A-Za-z0-9-]*$/.test(missionId)) {
    throw new Error("A mission identifier such as M-2026-08-pilot is required.");
  }
  if (!/^[0-9a-f]{40}$/.test(baseCommit ?? "") || !/^\d+$/.test(String(migrationHead ?? ""))) {
    throw new Error("Mission allocation records a full base commit and numeric migration head.");
  }
  const resolvedRepo = fs.realpathSync(repoPath);
  const paths = coordinatorPaths(resolvedRepo, env);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const step = await withAllocatorLock(paths, () => {
      const registry = readRegistry(paths.registry);
      const existing = Object.values(registry.slots).find(
        (record) => record.missionId === missionId,
      );
      if (existing && !["released", "stale"].includes(existing.state)) {
        existing.lastHeartbeat = new Date(now).toISOString();
        writeRegistry(paths.registry, registry);
        writeSession(resolvedRepo, existing);
        return { record: { ...existing, resumed: true } };
      }
      if (existing) {
        // The same mission taking its own released stack back. Re-fence it in
        // place: a fresh token, a fresh session, and no applied configuration,
        // because the containers still hold the previous holder's. Allocating a
        // new index instead is what spun forever before LAN-148.
        existing.token = crypto.randomBytes(32).toString("hex");
        existing.owner = {
          pid,
          sessionId: crypto.randomUUID(),
          startedAt: new Date(now).toISOString(),
        };
        existing.lastHeartbeat = new Date(now).toISOString();
        existing.state = "active";
        existing.baseCommit = baseCommit;
        existing.migrationHead = Number(migrationHead);
        existing.attachedRepoPaths = [resolvedRepo];
        existing.appliedConfig = null;
        existing.runtimeRoot = prepareRuntime(resolvedRepo, existing);
        writeRegistry(paths.registry, registry);
        writeSession(resolvedRepo, existing);
        return { record: { ...existing, refenced: true } };
      }

      const allocatedPorts = new Set(
        Object.values(registry.slots).flatMap((record) => [
          ...Object.values(record.ports),
          record.applicationPort,
        ]),
      );
      const candidates = [];
      for (let index = 0; index < MAX_MISSION_SLOTS && candidates.length < 4; index += 1) {
        const candidate = missionSlot(missionId, index);
        if (registry.slots[candidate.name]) continue;
        const wanted = [...Object.values(candidate.ports), candidate.applicationPort];
        if (wanted.some((port) => allocatedPorts.has(port))) continue;
        candidates.push(candidate);
      }
      return { candidates };
    });

    if (step.record) return step.record;
    if (step.candidates.length === 0) {
      throw new Error(
        `No mission database slot is available for ${missionId} within ${MAX_MISSION_SLOTS} indices; release a finished mission stack first.`,
      );
    }

    let free;
    for (const candidate of step.candidates) {
      const occupied = await Promise.all(
        [...Object.values(candidate.ports), candidate.applicationPort].map(portProbe),
      );
      if (!occupied.some(Boolean)) {
        free = candidate;
        break;
      }
    }
    if (!free) {
      throw new Error(
        `Every candidate mission stack for ${missionId} has occupied ports; refusing to attach to a process this coordinator does not own.`,
      );
    }

    const claimed = await withAllocatorLock(paths, () => {
      const registry = readRegistry(paths.registry);
      if (registry.slots[free.name]) return null;
      const token = crypto.randomBytes(32).toString("hex");
      const runtimeRoot = prepareRuntime(resolvedRepo, free);
      const record = {
        missionId,
        repoPath: resolvedRepo,
        attachedRepoPaths: [resolvedRepo],
        baseCommit,
        migrationHead: Number(migrationHead),
        owner: { pid, sessionId: crypto.randomUUID(), startedAt: new Date(now).toISOString() },
        token,
        lastHeartbeat: new Date(now).toISOString(),
        state: "active",
        slot: free.name,
        projectId: free.projectId,
        ports: free.ports,
        applicationPort: free.applicationPort,
        runtimeRoot,
        appliedConfig: null,
      };
      registry.slots[free.name] = record;
      writeRegistry(paths.registry, registry);
      writeSession(resolvedRepo, record);
      return record;
    });
    if (claimed) return claimed;
  }
  throw new Error(
    `Could not allocate a mission database stack for ${missionId} under contention; retry.`,
  );
}

function writeSession(repoPath, record) {
  const sessionDir = path.join(repoPath, ".lancers-runtime");
  fs.mkdirSync(sessionDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    path.join(sessionDir, "lease.json"),
    `${JSON.stringify({ slot: record.slot, token: record.token, sessionId: record.owner?.sessionId ?? null }, null, 2)}\n`,
    { mode: 0o600 },
  );
}

export async function attachMissionLease({ missionId, repoPath, token, env = process.env }) {
  const resolvedRepo = fs.realpathSync(repoPath);
  const paths = coordinatorPaths(resolvedRepo, env);
  return withAllocatorLock(paths, () => {
    const registry = readRegistry(paths.registry);
    const record = Object.values(registry.slots).find((candidate) => candidate.token === token);
    if (!record || record.missionId !== missionId || record.state !== "active") {
      throw new Error("Missing, invalid, stale, or mismatched mission database token.");
    }
    if (!record.attachedRepoPaths.includes(resolvedRepo))
      record.attachedRepoPaths.push(resolvedRepo);
    writeRegistry(paths.registry, registry);
    writeSession(resolvedRepo, record);
    return record;
  });
}

export function readSession(repoPath) {
  return JSON.parse(fs.readFileSync(path.join(repoPath, ".lancers-runtime", "lease.json"), "utf8"));
}

/** Every holder of this token: the acquiring worktree and any attached one. */
function holds(record, resolvedRepo) {
  return (
    record.repoPath === resolvedRepo || Boolean(record.attachedRepoPaths?.includes(resolvedRepo))
  );
}

/** @param {{repoPath: string, token: string, state?: "active"|"review-ready", now?: number, env?: NodeJS.ProcessEnv}} input */
export async function updateLease({
  repoPath,
  token,
  state = undefined,
  now = Date.now(),
  env = process.env,
}) {
  const resolvedRepo = fs.realpathSync(repoPath);
  const paths = coordinatorPaths(resolvedRepo, env);
  return withAllocatorLock(paths, () => {
    const registry = readRegistry(paths.registry);
    const record = Object.values(registry.slots).find((candidate) => candidate.token === token);
    if (!record || !holds(record, resolvedRepo))
      throw new Error("Missing, invalid, or stale local Supabase ownership token.");
    if (!["active", "review-ready"].includes(record.state))
      throw new Error(`Lease is ${record.state}; database mutation is refused.`);
    if (state) record.state = state;
    record.lastHeartbeat = new Date(now).toISOString();
    writeRegistry(paths.registry, registry);
    return record;
  });
}

/**
 * Record that the running stack now holds this rendered configuration.
 * Called by the guarded database command once the stack has actually been
 * started with it — never on the strength of the files alone.
 */
export async function markConfigApplied({
  repoPath,
  token,
  fingerprint,
  now = Date.now(),
  env = process.env,
}) {
  const resolvedRepo = fs.realpathSync(repoPath);
  const paths = coordinatorPaths(resolvedRepo, env);
  return withAllocatorLock(paths, () => {
    const registry = readRegistry(paths.registry);
    const record = Object.values(registry.slots).find((candidate) => candidate.token === token);
    if (!record || !holds(record, resolvedRepo))
      throw new Error("Missing, invalid, or stale local Supabase ownership token.");
    record.appliedConfig = fingerprint;
    record.lastHeartbeat = new Date(now).toISOString();
    writeRegistry(paths.registry, registry);
    return record;
  });
}

/**
 * Refuse readiness when the containers are not running the configuration this
 * holder rendered. The failure this prevents is invisible from the filesystem:
 * a re-fenced stack serving the previous holder's Auth redirect allow-list.
 */
export function assertConfigApplied(repoPath, record) {
  const fingerprint = renderedConfigFingerprint(repoPath, record);
  if (!record.appliedConfig) {
    throw new Error(
      `${record.slot} has not been started under this holder's configuration. Run the guarded start so Auth applies it, then retry.`,
    );
  }
  if (record.appliedConfig !== fingerprint) {
    throw new Error(
      `${record.slot} is running a different configuration from the one rendered for it; Auth would still serve the previous site URL and redirect allow-list. Restart the stack, then retry.`,
    );
  }
  return fingerprint;
}

/**
 * Release exactly the record this session holds.
 *
 * LAN-148: the token alone used to select the record, and only the acquiring
 * repository path was checked. A session whose `lease.json` named a different
 * slot — a stale file, a copied worktree — could therefore release, and report
 * releasing, a record that was not the one it held. The session's own slot must
 * agree with the record the token selects.
 */
/** @param {{repoPath: string, token: string, slot?: string, now?: number, env?: NodeJS.ProcessEnv}} input */
export async function releaseLease({
  repoPath,
  token,
  slot = undefined,
  now = Date.now(),
  env = process.env,
}) {
  const resolvedRepo = fs.realpathSync(repoPath);
  const paths = coordinatorPaths(resolvedRepo, env);
  return withAllocatorLock(paths, () => {
    const registry = readRegistry(paths.registry);
    const record = Object.values(registry.slots).find((candidate) => candidate.token === token);
    if (!record || !holds(record, resolvedRepo))
      throw new Error("Missing, invalid, or stale local Supabase ownership token.");
    if (slot !== undefined && slot !== record.slot) {
      throw new Error(
        `This session records slot ${slot}, but its token belongs to ${record.slot}; refusing to release a slot this session does not hold.`,
      );
    }
    record.state = "released";
    record.lastHeartbeat = new Date(now).toISOString();
    writeRegistry(paths.registry, registry);
    return record;
  });
}

export async function cleanupStale({
  repoPath,
  now = Date.now(),
  env = process.env,
  probe = process.kill,
}) {
  const paths = coordinatorPaths(repoPath, env);
  return withAllocatorLock(paths, () => {
    const registry = readRegistry(paths.registry);
    const changed = [];
    for (const record of Object.values(registry.slots)) {
      if (record.state === "active" && reclaimable(record, now, probe)) {
        record.state = "stale";
        changed.push(record.slot);
      }
    }
    writeRegistry(paths.registry, registry);
    return changed;
  });
}

export function coordinatorStatus(repoPath, env = process.env) {
  const paths = coordinatorPaths(repoPath, env);
  return readRegistry(paths.registry);
}
