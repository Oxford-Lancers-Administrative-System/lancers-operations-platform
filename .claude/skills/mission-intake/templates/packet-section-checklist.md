# Packet completeness checklist

- Commissioned outcome, objective, why now, scope, non-goals
- Acceptance evidence and completion evidence
- Durable version-pinned sources and per-requirement provenance
- Exact frozen workflow inventory and workflow matrix
- Locked, proposed, and delegated decisions
- External systems and authority boundaries
- Safety, privacy, consent, recovery, and rollout constraints
- Prerequisite gates and qualifying owner actions
- Revision triggers and escalation rules
- Nonblocking unknowns and handling rules
- Repository baseline and drift rules
- Blockers and honest readiness status
- Merge envelope and owner-gated classes
- Packet README, sources manifest, approved mocks, acceptance records

Required structured sections: `workflow_matrix`, `delegated_to_mission_lead`,
`nonblocking_unknowns`, `escalation_rules`, `repository_drift`, `blockers`.
Each is populated or `{ "status": "not_applicable", "reason": "..." }`.
