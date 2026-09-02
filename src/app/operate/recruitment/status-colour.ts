import type { ProspectStatus } from "@/lib/services/recruitment-vocabulary";

/**
 * Recruitment's own status-pill colours — LAN-204, item 1 (Brian,
 * 2026-09-02: "For status, they should use the same pill formula. They
 * should use the same colours for the most part, except not for
 * recruitment. How they did it is fine."). The *formula* is
 * `../board-filter-controls.tsx`'s `StatusPill`, shared with the roster;
 * which of MUI's seven semantic keywords each of these seven values gets is
 * this board's own choice — one keyword per value, so every status reads as
 * a genuinely distinct colour rather than a shade of another one.
 *
 * The one map, read by both `status-cell.tsx` (the board cell and the
 * record header) and `recruitment-board-view.tsx`'s own phone card, so a
 * status is never a different colour depending which surface shows it.
 */
export const STATUS_COLOUR_FOR_PILL: Readonly<
  Record<ProspectStatus, "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning">
> = Object.freeze({
  identified: "default",
  engaged: "info",
  committed: "primary",
  joined: "success",
  declined: "error",
  disengaged: "warning",
  void: "secondary",
});
