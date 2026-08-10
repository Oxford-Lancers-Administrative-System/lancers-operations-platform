# Architecture Decision Records

One file per decision, numbered, immutable once accepted. To change a decision,
add a new ADR that supersedes the old one and mark the old one `Superseded by
NNNN` — do not edit history.

Record a decision here when it constrains future work: something a future
developer or agent would otherwise have to re-litigate or would break by
accident. Routine implementation choices do not need an ADR.

| ADR                                              | Title                                                                  | Status                 |
| ------------------------------------------------ | ---------------------------------------------------------------------- | ---------------------- |
| [0001](0001-local-supabase-only.md)              | Development and CI run against local Supabase only                     | Accepted               |
| [0002](0002-rls-posture.md)                      | RLS enabled everywhere, deny-by-default                                | Accepted               |
| [0003](0003-supabase-key-types.md)               | Support both Supabase key naming schemes                               | Accepted               |
| [0004](0004-styling-baseline.md)                 | Material UI is the styling baseline; Tailwind is unresolved            | **Open**               |
| [0005](0005-github-to-gcp-auth.md)               | GitHub authenticates to GCP with OIDC and Workload Identity Federation | Accepted               |
| [0006](0006-solo-developer-branch-protection.md) | `main` is protected, CI is required, zero human approvals              | Accepted (provisional) |
| [0007](0007-zero-domain-code-boundary.md)        | This repository contains no club domain schema                         | Accepted               |
