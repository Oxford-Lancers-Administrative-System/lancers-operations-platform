"use client";

import Button, { type ButtonProps } from "@mui/material/Button";
import { useFormStatus } from "react-dom";

/**
 * A submit button that shows the save in flight — LAN-498. Disabled while its
 * form's submit is pending, so a tap during an automatic save cannot send a
 * second one; `savingLabel` replaces the label on the one button that names
 * the save. Passed in rather than imported: `presentation.ts` reaches a
 * server-only module, and this is a client component.
 */
export function PendingSubmitButton({
  children,
  savingLabel,
  ...props
}: Omit<ButtonProps, "type"> & { savingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button {...props} type="submit" disabled={pending || props.disabled}>
      {pending && savingLabel !== undefined ? savingLabel : children}
    </Button>
  );
}
