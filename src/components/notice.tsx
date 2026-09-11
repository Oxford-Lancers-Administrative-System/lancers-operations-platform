import type { ReactNode } from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";

/**
 * The one shape for a message the application has to say — LAN-225, brief
 * §2. See `docs/architecture/components.md` and `docs/ux/design-system.md`
 * § 5. `variant="refusal"` carries the fixed title, so a refusal cannot be
 * styled as a validation error on one screen and a crash on another.
 *
 * Decision history: docs/ux/tickets/LAN-231-design-rollout.md
 */
export const REFUSAL_TITLE = "Not permitted";

export type NoticeSeverity = "success" | "warning" | "error" | "info";

export function Notice({
  severity = "info",
  variant = "standard",
  title,
  action,
  children,
  testId,
}: {
  severity?: NoticeSeverity;
  variant?: "standard" | "refusal";
  title?: string;
  /** One control, right-aligned, where the notice offers a way forward. */
  action?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  const resolvedSeverity = variant === "refusal" ? "warning" : severity;
  const resolvedTitle = variant === "refusal" ? (title ?? REFUSAL_TITLE) : title;

  return (
    <Alert
      severity={resolvedSeverity}
      action={action}
      data-testid={testId}
      data-variant={variant}
      role={variant === "refusal" ? "status" : undefined}
    >
      {resolvedTitle ? <AlertTitle sx={{ fontWeight: 700 }}>{resolvedTitle}</AlertTitle> : null}
      {children}
    </Alert>
  );
}
