# Source manifest

The machine-readable source list and pinned versions are in `packet.json`. This
file records why each source controls or informs the packet.

| Source | Authority and use |
| --- | --- |
| [Oxford Lancers project home](https://app.notion.com/p/3aa488886d5780428888da8b5792fa96) | Mission Control, authority order, no active approved mission |
| [Start the Lancers Mission Intake Agent](https://app.notion.com/p/3c0488886d578118a77bf8ccb5f15514) | Intake role, packet workflow, readiness and handoff rules |
| [Lancers Current Project Status](https://app.notion.com/p/3bb488886d578126a88cdd747f590a01) | Current stage, active gates and production boundary |
| [Release 1 Authority Manifest — Final](https://app.notion.com/p/3bf488886d57818aa53ec09f4fc5f757) | Scope 3 readiness and Release 1 exclusions/gates |
| [Identity, Access & Ownership — Feature Brief](https://app.notion.com/p/3bc488886d5781d78d18f045492073cd) | Controlling product behavior, routes, lifecycle, safeguards and approved decisions |
| [The 16 Locked Requirements](https://app.notion.com/p/3b7488886d578131905bc9ac24910584) | R1/R10/R14 baseline and audit/recovery invariants |
| [Governance and Operating Decisions](https://app.notion.com/p/3bb488886d5781e7a7b9cb598831dd67) | Source routing, hosted-data and production-write boundaries |
| [LAN-71](https://linear.app/brian-schuster/issue/LAN-71) | Implemented Person-to-operator identity join |
| [LAN-72](https://linear.app/brian-schuster/issue/LAN-72) | Implemented transaction and audit substrate |
| [LAN-73](https://linear.app/brian-schuster/issue/LAN-73) | Implemented operator shell and capability enforcement |
| [LAN-124](https://linear.app/brian-schuster/issue/LAN-124) | Later execution record cited by current capability-map authority |
| [LAN-84](https://linear.app/brian-schuster/issue/LAN-84) | Explicitly excluded R14 recovery and production-security gate |
| [Repository main at intake](https://github.com/Oxford-Lancers-Administrative-System/lancers-operations-platform/tree/5812390914b4ca45b609328ffd929ec45071be17) | Implemented reality and observed drift baseline |
| [`capabilities.ts`](https://github.com/Oxford-Lancers-Administrative-System/lancers-operations-platform/blob/5812390914b4ca45b609328ffd929ec45071be17/src/lib/auth/capabilities.ts) | Current `role_management = [it_officer]` implementation that conflicts with Notion |
| [Canonical packet validator](https://github.com/Oxford-Lancers-Administrative-System/lancers-operations-platform/blob/5812390914b4ca45b609328ffd929ec45071be17/scripts/mission/lib/packet.mjs) | Schema used for this packet |

Supporting July interviews, proposals and spreadsheets were not needed to
resolve a detected gap beyond the current approved records. They therefore did
not override or expand this mission.
