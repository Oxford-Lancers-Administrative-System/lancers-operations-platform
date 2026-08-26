# 0037 — The package gate includes mockup conformance

**Status:** Accepted · **Date:** 2026-08-26 · **Supersedes only:** ADR 0035's
exclusion of pre-owner per-package presentation review

Approved by Brian through LAN-176.

## Context

ADR 0035 removed the agent walk before Brian's package walkthrough because it
duplicated his product judgment. In the next mission Brian approved behaviour
but rejected the rendering on three visual packages. Each worker had named the
UX sources, yet no independent gate compared the rendered package with the
approved mockup states; security review was explicitly forbidden to do so.

The missing check is conformance, not another product walkthrough. Whether a
mockup draws four sections while the package renders two is observable without
deciding which design is better.

## Decision

Replace the pre-owner security clearance with one exact-head **package gate**.
Its review scope is the union of:

- the existing sensitive-path intersection; and
- every approved mockup state for visual or mixed work, rendered at desktop and
  measured 375px.

When both scopes are empty the Lead records deterministic clearance and launches
no reviewer. Otherwise one bounded Sonnet reviewer covers the union. The receipt
names the mockup states and comparison method. Unexplained dropped, merged,
reordered or reduced structural elements or copy changes block owner handoff;
an answered mission question may authorize a named departure. Button variants,
colour, typography, spacing, component idiom and shared formatters come from the
application, never the mockup, and cannot produce a conformance finding.

Brian's zero-command package walkthrough remains the final mutable gate. Exact-
head CI, correction limits, security scope, protected review environment,
guarded merge route and one final mission workflow smoke are unchanged.

## Consequences

- A visual package cannot become owner-ready merely by naming its UX sources.
- Visual and security scope share one invocation rather than adding two review
  layers.
- Any head change invalidates package-gate coverage under the existing exact-
  head rule.
- Brian still decides whether the approved design should change.
