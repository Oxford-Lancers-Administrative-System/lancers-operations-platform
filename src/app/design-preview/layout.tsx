import { Themed } from "./themed";

/**
 * Everything under `/design-preview` renders on the club theme; nothing
 * outside it does.
 *
 * This layout is why the branch is safe to merge. The preview's own screens —
 * the operator ones under `(operator)`, and the public ones that have no
 * operator shell (`login`, `rsvp`, `player-home`, the questionnaire steps,
 * `answer`) — all sit inside it, so one wrapper covers the lot. Gating stays
 * where it was: every page calls `gateShellPage`, and the `(operator)` layout
 * still redirects and renders the account state. This adds a theme and
 * nothing else.
 */
export default function DesignPreviewLayout({ children }: LayoutProps<"/design-preview">) {
  return <Themed>{children}</Themed>;
}
