"use client";

import { useCallback, useSyncExternalStore } from "react";
import { formatWhen } from "../../roster/presentation";

/** A scheduled caption becomes due even if the operator leaves the record open. */
export default function QueuedSendTime({ scheduledFor }: { scheduledFor: string }) {
  const scheduledAt = new Date(scheduledFor).getTime();
  const subscribe = useCallback(
    (changed: () => void) => {
      let timer: ReturnType<typeof setTimeout>;
      const check = () => {
        changed();
        if (scheduledAt > Date.now()) {
          timer = setTimeout(check, Math.min(scheduledAt - Date.now() + 1, 2_147_483_647));
        }
      };
      check();
      return () => clearTimeout(timer);
    },
    [scheduledAt],
  );
  const due = useSyncExternalStore(
    subscribe,
    () => scheduledAt <= Date.now(),
    () => true,
  );
  return due ? "Queued — awaiting dispatch" : `Queued for ${formatWhen(new Date(scheduledFor))}`;
}
