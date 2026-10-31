"use client";

import Button, { type ButtonProps } from "@mui/material/Button";
import { useFormStatus } from "react-dom";

import { SAVING } from "./presentation";

/**
 * A submit button that shows the save in flight — LAN-498. Disabled while its
 * form's submit is pending, so a tap during an automatic save cannot send a
 * second one; `showsSaving` puts "Saving…" on the one button that names it.
 */
export function PendingSubmitButton({
  children,
  showsSaving = true,
  ...props
}: Omit<ButtonProps, "type"> & { showsSaving?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button {...props} type="submit" disabled={pending || props.disabled}>
      {pending && showsSaving ? SAVING : children}
    </Button>
  );
}
