# Mission packets

The canonical, repository-durable home of approved mission packets:

```
missions/packets/<mission-id>/packet.json
```

**Brian's merge of a packet PR is the approval.** The Mission Intake Agent
drafts a packet here on a dedicated branch and opens a packet-only pull
request — nothing else may ride in it, and `missions/**` is prohibited from
every automatic merge lane, so only Brian can merge one. The merged commit
on `main` identifies the exact approved packet version; approval is never a
field somebody typed, it is a merge Brian performed.

Rules that hold for every packet:

- The schema is `scripts/mission/lib/packet.mjs`; check a draft with
  `npm run mission -- validate --packet <file>` (pure — it writes no state).
- `status` is `"approved"` or `"not_ready"`. An intake draft that cannot
  honestly be completed ships as `not_ready` — it is valid to store and
  impossible to execute: `mission init` refuses it.
- `baseline.commit` pins the exact `main` SHA the packet was drafted
  against, so drift is a computable fact rather than a feeling.
- A Mission Lead initializes only from a packet at this path on `main`,
  never from a file handed to it directly.
- A material revision is a new `packet_version` in a new packet PR — the
  original approved packet is never mutated. History stays in git.

The synthetic rehearsal fixture (never a real mission) lives in
`tests/fixtures/mission/approved-packet.json`. See `docs/mission-harness.md`
for the full operating guide.
