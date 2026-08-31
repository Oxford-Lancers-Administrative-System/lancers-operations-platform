# Approved mockups — M-RECRUITMENT

The approved mocks are **not duplicated here**. They live in the intake ledger,
which lands in the same pull request and stays on `main` beside this packet:

```
missions/intake/M-RECRUITMENT/mockups/
  index.html                     the hub — start here
  W1-…-W14-….html                one review page per workflow
  shots/shots.json               provenance for every photograph
  shots/<screen>-<side>-<viewport>.png
  src/                           the per-screen proposals, as authored
  proposals/                     the built proposals the shoot evaluated
```

The shots alone are 30 MB. Copying them into this directory would double that in
the same commit for byte-identical files, so this packet points at them instead.
Nothing is missing: the two trees are approved together, merged together, and
immutable together once Brian merges.

## What a screen is, in this mission

Every one of the 39 screens is a **photograph of the running application** at
`main@e669331d96fb949a3c29d7475842a6414cfe9e57`, on both sides, at a
browser-measured 1280px and a browser-measured 375px. The proposal is evaluated
into the real page — inserted between real form fields, or replacing the rows of
a real card — so the current and proposed sides are the same running page
differing only by the change. No screen pairs a photograph with a drawing.

`shots/shots.json` records, per screen, the route photographed, the measured
width the browser reported, and the sha256 and byte count of the proposal that
produced the proposed side.

## What the screens are grounded in

| Workflow | Screens         | Surface photographed                                             |
| -------- | --------------- | ---------------------------------------------------------------- |
| W1       | W1-01 … W1-04   | `/operate/roster` — the board this one is modelled on            |
| W2       | W2-01 … W2-04   | `/operate/roster/[membershipId]` — the shipped player record     |
| W3       | none            | Removed. The number draws no screens                             |
| W4       | W4-01 … W4-03   | `/a/[token]` — the shared signed-link form                       |
| W5       | W5-01 … W5-03   | `/operate/events/[id]/attendance`                                |
| W6       | W6-01, W6-02    | `/operate/people/new`                                            |
| W7       | W7-01 … W7-03   | the public sign-up page                                          |
| W8       | W8-01           | `/operate/people/new`, driving its real duplicate check          |
| W9       | none            | Folded. The number draws no screens                              |
| W10      | W10-01          | `/operate/admin/messaging`                                       |
| W11      | W11-01 … W11-06 | `/operate/events/*`, `/rsvp/[token]`, `/operate/admin/messaging` |
| W12      | W12-01, W12-02  | `/operate/events/[id]/attendance`                                |
| W13      | W13-01, W13-02  | `/operate/roster`, rebuilt as the recruit board                  |
| W14      | W14-01 … W14-03 | `/operate/roster`, rebuilt as the recruit board                  |

## Synthetic, and only synthetic

Rosalind Penhaligon (`identified`) and Tobias Wrenfield (`engaged`) are really
seeded at the baseline by `8a4239f`. Every other person, message, event and
answer is invented in the same synthetic universe. No real person, contact
detail or club record appears on any screen.

Three rows were written to the **local** mission database so that two screens
could be photographed rather than drawn: an `rsvp_access_tokens` row and an
`rsvp_responses` row for W11-03 and W11-04, and a draft recruitment event
`3f7c21a9-4d0e-4b6a-9c31-8e5d7a0b4c12` — _Taster session 3_, 35 players and 2
recruits — for W11-05, because no seeded draft carried an audience to plan
against. Local and synthetic; nothing hosted was touched.
