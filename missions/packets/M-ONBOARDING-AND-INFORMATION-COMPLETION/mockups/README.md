# Approved mockups — M-ONBOARDING-AND-INFORMATION-COMPLETION

The reviewed screens are not copied here. They live in the intake ledger, where they are
generated from `state.json` and `shots/shots.json` and cannot drift from it:

```
missions/intake/M-ONBOARDING-AND-INFORMATION-COMPLETION/mockups/
  index.html                     the hub: every workflow, its state, its screen count
  W<n>-<slug>.html               one review page per workflow
  shots/                         the photographs, and shots.json recording each one's head SHA
  src/, proposals/               the producers, and their built form
```

Serve the ledger directory over HTTP and open `mockups/index.html`:

```bash
python3 -m http.server 4177 --bind 127.0.0.1
```

**Thirty-one screens, all photographs.** Each was taken against the running application on a
mission database slot, on both sides — the current build as it ships, and the same running
page with the proposal evaluated into it. `shots.json` records the head SHA, the measured
viewport width and the proposal's hash for every one, so a screen cannot silently diverge
from the producer that made it.

Screens `W1-01` through `W10-02` were taken at `main@332bc6b`; `W11-01` at `main@0a04be7`,
after main was merged in mid-intake. See `repository_drift.recorded` in `packet.json`.
