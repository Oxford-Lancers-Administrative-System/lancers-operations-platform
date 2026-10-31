"use client";

import { useCallback, useEffect } from "react";

import {
  ATTENDANCE_GROUP_FAMILIES,
  parseAttendanceGroupBy,
  type AttendanceGroupFamily,
} from "@/lib/services/attendance-group-by";

/**
 * LAN-497: the one remembered Group by choice. The attendance register and the
 * event page's Everyone asked table read and write the same browser key
 * (`attendanceGroupByStorageKey`), so choosing on either applies to both.
 */

/** The stored value for None, so a deliberate None is remembered rather than read as "nothing stored". */
const STORED_NONE = "none";

function readStored(storageKey: string): string | null {
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

function writeStored(storageKey: string, value: string): void {
  try {
    window.localStorage.setItem(storageKey, value);
  } catch {
    // No storage: the link still carries the choice.
  }
}

/**
 * A link without `by` opens on the viewer's last choice in this browser — None
 * on a first visit. A remembered family they may no longer see is ignored.
 * Returns the function to call when they choose; `restore` is called with the
 * remembered family so the caller can put it in the link.
 */
export function useRememberedGroupBy({
  storageKey,
  groupBy,
  families,
  restore,
}: {
  storageKey: string | null;
  groupBy: AttendanceGroupFamily | null;
  families: readonly AttendanceGroupFamily[];
  restore: (family: AttendanceGroupFamily) => void;
}): (value: string) => void {
  const familiesKey = families.join(",");

  useEffect(() => {
    if (storageKey === null || groupBy !== null) return;
    if (new URLSearchParams(window.location.search).has("by")) return;
    const visible = ATTENDANCE_GROUP_FAMILIES.filter((family) =>
      familiesKey.split(",").includes(family),
    );
    const stored = parseAttendanceGroupBy(readStored(storageKey), visible);
    if (stored !== null) restore(stored);
  }, [storageKey, groupBy, familiesKey, restore]);

  return useCallback(
    (value: string) => {
      if (storageKey !== null) writeStored(storageKey, value === "" ? STORED_NONE : value);
    },
    [storageKey],
  );
}
