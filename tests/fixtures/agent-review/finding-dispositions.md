# Dry run: finding impact and gate disposition

This is an executable-policy transcript fixture, not evidence that a language
model will comply mechanically.

1. A stale cosmetic sentence in an issue-owned changed-file comment is low
   impact and `correct-before-handoff` when materially false; otherwise it is
   `advisory`. Exact read-back proves a required correction. Neither disposition
   triggers a reviewer invocation.
2. A hosted runbook expecting an intentionally removed UI state is medium
   impact and `correct-before-handoff`. Ready-for-merge handoff is refused until
   a targeted assertion or exact runbook read-back passes. Its prose-only
   correction triggers no reviewer invocation.
3. A UI that remains visibly Saved after its attendance record is deleted has
   medium impact and disposition `block`; its executable correction requires
   correction review.
4. An unauthorized operator writing attendance has high impact and disposition
   `block`. The authorization hard exclusion rejects both lower dispositions.
5. A correction that can lose, corrupt, mis-anchor, or falsely present committed
   attendance has high impact and disposition `block`. The data-integrity hard
   exclusion rejects both lower dispositions.
6. A proposed documentation correction that also changes an executable role
   list, migration instruction, or production action crosses a material-risk
   boundary. It is reclassified from `correct-before-handoff` to `block` before
   implementation, then receives applicable verification and correction review.
7. One mixed review returns authorization blocker R-101 and artifact corrections
   R-102 and R-103. All three corrections may share one commit. Correction review
   is independently triggered by R-101 and examines its correction plus newly
   affected executable behavior. R-102 and R-103 receive exact prose read-back,
   do not independently expand review scope, and are reported separately by
   severity, disposition, consequence, invocation effect, and artifact.
