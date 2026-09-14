/**
 * Shared chronological driver. Workflow adapters provide their next due work;
 * the clock never shifts existing rows or rewrites historical evidence.
 * Wall time is deliberately independent of this clock (authentication and
 * network budgets must continue to use real time).
 */
export function advanceTarget(current, hours) {
  const start = Date.parse(current);
  if (!Number.isFinite(start)) throw new Error("The shared test time is invalid.");
  if (typeof hours !== "number" || !Number.isFinite(hours) || hours <= 0 || hours > 8760)
    throw new Error("Advance by a positive number of hours, up to one year.");
  return new Date(start + hours * 3_600_000).toISOString();
}

/**
 * Process each due boundary to completion before considering the next one.
 * A failed boundary remains the current test time, so retry resumes there.
 * The adapter must return null only when no due work remains through target.
 */
export async function advanceChronologically({
  current,
  hours,
  nextDue,
  setTime,
  settle,
  maxSteps = 10000,
}) {
  const target = advanceTarget(current, hours);
  let cursor = Date.parse(current);
  const end = Date.parse(target);
  let steps = 0;
  while (true) {
    if (++steps > maxSteps)
      throw new Error(
        "Test progression stopped because due work is not settling. Evidence is preserved.",
      );
    // This includes responses and jobs already due when the advance begins.
    await setTime(new Date(cursor).toISOString());
    await settle(new Date(cursor).toISOString());
    const next = await nextDue({ current: new Date(cursor).toISOString(), through: target });
    if (next === null) {
      if (cursor === end) return { time: target, steps };
      cursor = end;
      continue;
    }
    const due = Date.parse(next);
    if (!Number.isFinite(due) || due < cursor || due > end)
      throw new Error("A workflow returned an invalid next test time. Evidence is preserved.");
    cursor = due;
  }
}
