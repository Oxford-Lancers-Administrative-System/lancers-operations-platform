// W8-02 — The one case the shipped check cannot resolve: nobody is at the
// keyboard.
//
// W7's door is self-serve. A recruit submits their own name at a stand, the
// check finds a candidate, and there is no operator present to choose. Task 09
// §3: nothing is created, nothing is messaged, and it parks. That queue is the
// only genuinely new thing in this workflow, and it is built in the language of
// the check above it, not the language of the merge screen.
const anchor = cardTemplate();

// 1. What is waiting, and what is being held while it waits. A queue nobody can
//    see is a queue nobody works, so the count also sits on the board.
const queue = proposedRegion("Waiting for a decision · 2");
queue.append(
  makeRow(
    "Rosalind Penhaligon · submitted 14:12 at the stand",
    "Matches 1 person · welcome held, nothing written",
  ),
  makeRow(
    "T. Wrenfield · submitted 14:31 at the stand",
    "Matches 2 people · welcome held, nothing written",
  ),
);
placeBefore(anchor, queue);
mark(queue, 1);

// 2. One parked capture, opened: what they typed beside what the club holds.
//    A submission on the left, a record on the right — not two records, because
//    only one of them exists.
const one = proposedRegion("What they typed · what we hold");
one.append(
  makeRow("First name", "Rosalind  ·  Rosalind"),
  makeRow("Last name", "Penhaligon  ·  Penhaligon"),
  makeRow("Mobile", "07700 900318  ·  07700 900318"),
  makeRow("College", "not given  ·  Brasenose"),
  makeRow("Standing", "—  ·  Member, 2026-27"),
);
placeBefore(anchor, one);
mark(one, 2);

// 3. The two outcomes, which are create and link — never survivor and loser.
//    Linking an existing member must not fire a "welcome to the club" message.
const outcomes = proposedRegion("The decision");
outcomes.append(primaryButton("This is them — link, send nothing"));
outcomes.append(primaryButton("This is somebody new — create, and welcome them"));
placeBefore(anchor, outcomes);
mark(outcomes, 3);
