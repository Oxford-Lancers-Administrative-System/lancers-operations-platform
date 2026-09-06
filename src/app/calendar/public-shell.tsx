import type { ReactNode } from "react";
import { PublicShell as ClubPublicShell } from "@/components/public-shell";

/** Calendar context without operator navigation or an account prompt. */
export default function PublicShell({
  seasonLabel,
  action,
  children,
}: {
  seasonLabel: string | null;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <ClubPublicShell
      width="wide"
      action={action}
      caption={seasonLabel === null ? "Club calendar" : `Club calendar · Season ${seasonLabel}`}
    >
      {children}
    </ClubPublicShell>
  );
}
