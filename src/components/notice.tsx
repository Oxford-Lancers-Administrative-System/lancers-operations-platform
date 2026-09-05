import type { ReactNode } from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";

/**
 * The one shape for a message the application has to say — LAN-225, brief §2.
 *
 * Replaces the 133 inline `Alert`s the audit counted, and does so with a rule
 * rather than a wrapper: a `Notice` is for an **outcome** (something just
 * happened), a **refusal** (the rules say no — `docs/ux/standards.md` rule 6)
 * or a **condition** the reader has to know about now. Standing guidance,
 * explanations of the design, and "this page does X" are not notices; they are
 * subtitle or helper text or nothing (audit E2, H1–H3, H7).
 *
 * `variant="refusal"` is a warning that keeps the guard's own sentence and
 * carries the fixed title, so a refusal cannot be styled as a validation error
 * on one screen and as a crash on another.
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
