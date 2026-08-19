# Architecture Decision Records

One file per decision, numbered, immutable once accepted. To change a decision,
add a new ADR that supersedes the old one and mark the old one `Superseded by
NNNN` — do not edit history.

Record a decision here when it constrains future work: something a future
developer or agent would otherwise have to re-litigate or would break by
accident. Routine implementation choices do not need an ADR.

| ADR                                                           | Title                                                                                                  | Status                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| [0001](0001-local-supabase-only.md)                           | Development and CI run against local Supabase only                                                     | Accepted                                            |
| [0002](0002-rls-posture.md)                                   | RLS enabled everywhere, deny-by-default                                                                | Accepted                                            |
| [0003](0003-supabase-key-types.md)                            | Support both Supabase key naming schemes                                                               | Accepted                                            |
| [0004](0004-styling-baseline.md)                              | Material UI and Tailwind coexist; MUI is the component baseline                                        | Accepted                                            |
| [0005](0005-github-to-gcp-auth.md)                            | GitHub authenticates to GCP with OIDC and Workload Identity Federation                                 | Accepted                                            |
| [0006](0006-solo-developer-branch-protection.md)              | `main` is protected, CI is required, zero human approvals                                              | Accepted (provisional)                              |
| [0007](0007-zero-domain-code-boundary.md)                     | This repository contains no club domain schema                                                         | Superseded by 0011                                  |
| [0008](0008-relational-mapping-conventions.md)                | Relational mapping conventions for the domain schema                                                   | Accepted                                            |
| [0009](0009-state-vocabulary-representation.md)               | Frozen state vocabularies are enums; configurable ones are tables                                      | Accepted                                            |
| [0010](0010-domain-table-access-posture.md)                   | Domain tables are unreachable from the browser, twice over                                             | Accepted                                            |
| [0011](0011-domain-schema-baseline.md)                        | The zero-domain-schema boundary is closed                                                              | Accepted                                            |
| [0012](0012-explicit-event-audience.md)                       | The confirmed event audience is a relation; its non-emptiness is not                                   | Accepted                                            |
| [0013](0013-supervised-agent-development.md)                  | Supervised parallel agent development, capped at two workers                                           | Superseded by 0018                                  |
| [0014](0014-transactional-data-access.md)                     | Transactional writes use a direct PostgreSQL connection — a second privileged credential               | Accepted                                            |
| [0015](0015-graded-review-levels.md)                          | Review is graded into four levels, keyed on reachability                                               | Superseded by 0018                                  |
| [0016](0016-controlled-production-pilot-data.md)              | Production may hold controlled pilot data before staging exists                                        | Accepted                                            |
| [0017](0017-batched-fast-lane.md)                             | A batched fast lane, merged by a workflow that re-derives eligibility                                  | Accepted                                            |
| [0018](0018-single-issue-agent-development.md)                | Single-issue agent development with fenced local concurrency                                           | Superseded by 0020                                  |
| [0019](0019-application-created-pilot-rows.md)                | Pilot rows the application creates carry a sentinel-only ownership marker                              | Proposed — Brian                                    |
| [0020](0020-zero-command-visual-review.md)                    | Zero-command visual acceptance precedes final review                                                   | Accepted; correction-review rule superseded by 0024 |
| [0021](0021-response-deadline-configuration.md)               | RSVP response deadlines are central configuration, not per-event input                                 | Accepted                                            |
| [0022](0022-audience-proposed-then-frozen.md)                 | An event's audience is proposed on the draft and frozen at approval                                    | Accepted                                            |
| [0023](0023-rsvp-token-and-whatsapp-delivery.md)              | RSVP links are hash-only and single-live; delivery is official 1:1 WhatsApp behind a provider boundary | Accepted                                            |
| [0024](0024-bounded-lineage-aware-review.md)                  | Bounded, lineage-aware independent review                                                              | Accepted; finding classification superseded by 0025 |
| [0025](0025-separate-finding-impact-from-gate-disposition.md) | Finding impact is separate from correction-review gate disposition                                     | Accepted                                            |
| [0026](0026-hosted-runtime-database-connection.md)            | The hosted runtime is a least-privilege login on the shared transaction pooler                         | Accepted                                            |
| [0027](0027-mission-harness.md)                               | Mission Harness v1: mission-oriented orchestration with a guarded autonomous merge lane                | Accepted                                            |
| [0028](0028-role-catalogue-is-read-only-reference-data.md)    | The role catalogue is read-only reference data for the application                                     | Accepted                                            |
| [0029](0029-concurrent-missions.md)                           | Concurrent missions are independently fenced and own disposable local databases                        | Accepted                                            |
