export interface BoardActionState {
  error: string | null;
}

/**
 * What the operator is told when the save itself never reached the server —
 * LAN-380. Plain, and only after a retry: a request that did not complete is
 * not a refusal, and the first thing to do about one is try it again.
 */
export const COULD_NOT_SAVE = "Could not save; try again.";

/**
 * A request that did not complete: no status, no body, nothing the server
 * decided. `fetch` rejects these as a `TypeError` — "Failed to fetch" in
 * Chrome's own words — and that is the only class retried here. A Server
 * Action that *did* reach the server and threw comes back as an ordinary
 * `Error` carrying React's digest, and is rethrown untouched: running it a
 * second time would repeat whatever the server already refused.
 */
function requestDidNotComplete(error: unknown): boolean {
  return error instanceof TypeError;
}

/**
 * Run one board or record commit, retrying exactly once when the request did
 * not complete — LAN-380.
 *
 * Both roster surfaces used to `await action()` with nothing around it. A
 * Server Action POST that is aborted or dropped rejects, the rejection escaped
 * into a fire-and-forget transition, and the operator was shown nothing at all
 * while their edit went nowhere — the field kept the value it already had, as
 * if that value had just been saved.
 *
 * Every commit these two surfaces make **sets** a value rather than changing it
 * by a step, and the one that appends history refuses a no-op
 * (`setMembershipStatus` returns early when the status is already the one asked
 * for), so a retry that turns out to be a second delivery of the same write
 * costs nothing.
 */
export async function commitWithRetry(
  action: () => Promise<BoardActionState>,
): Promise<BoardActionState> {
  try {
    return await action();
  } catch (error) {
    if (!requestDidNotComplete(error)) throw error;
  }

  try {
    return await action();
  } catch (retryError) {
    if (!requestDidNotComplete(retryError)) throw retryError;
    return { error: COULD_NOT_SAVE };
  }
}
