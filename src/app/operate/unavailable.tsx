import { Refusal } from "@/components/refusal";
import type { ReactNode } from "react";

// Shared across eight call sites. `message` is the service's own sentence — see relocations.md.
export function UnavailableScreen({
  title,
  message,
  testId,
  children,
}: {
  title: string;
  message: string;
  testId?: string;
  children?: ReactNode;
}) {
  return <Refusal title={title} message={message} testId={testId} action={children} />;
}
