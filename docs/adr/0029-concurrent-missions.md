# 0029 — Missions are independently fenced and own disposable local databases

**Status:** Accepted · **Date:** 2026-08-19

## Context

ADR 0027 bounded the whole harness to one Lead, two workers and two database
slots. Journals and locks were already per mission, so the mission count was a
documentation restriction. The remaining limits were accidental: Lead
ownership was checked only by `resume` and recorded a transient CLI PID, while
mission workers competed with ordinary issues for fixed database slots. A
crashed worker also had no event that could clear its active record.

## Decision

Brian may start any number of missions. Each mission independently has one
stable fenced Lead identity, at most two active implementation workers, and one
disposable local Supabase stack. A short allocator lock chooses a unique project
ID and complete port set; it is released immediately and is not admission
control. Workers attach their worktrees to the mission stack. The existing
primary/overflow topology remains for deliberate non-mission issue work.

A Lead may durably abandon a crashed worker, preserving history while returning
the package to the dispatch frontier. Database mutation is serialized only
inside the mission that owns the stack. Concurrent migration work reconciles
against current `main` at final integration; only an actual incompatibility
creates correction work. The repository-global merge workflow remains
serialized, but it orders integration rather than mission starts. Hosted
Supabase authority remains with Brian.

## Consequences

- Mission count is controlled by the owner, not the harness.
- A transient CLI process does not define the Lead identity.
- Mission stacks can be destroyed without affecting another mission or the
  standing stack and are reproducible from Git migrations and synthetic seed.
- ADR 0027's one-mission and two-slot topology is superseded. Its flat
  delegation, review, merge, production, and owner-authority decisions remain.
