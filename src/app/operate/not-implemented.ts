/**
 * The failure a privileged action raises once it has authorized the caller and
 * found it has no behaviour yet.
 *
 * It is deliberately **not** a `ServiceError`. A `ServiceError` is a refusal or
 * a rule the club recognises, and an operator may be shown one; this is a
 * statement that the software is unfinished, which is a developer's problem and
 * must never be mistaken for "you may not do that". Keeping the two classes
 * apart is what lets a test assert that a *permitted* caller got past the
 * guard: the guard throws `NotPermitted`, and this is what is left when it did
 * not.
 */
export class ActionNotImplemented extends Error {
  /** The Linear issue that gives this action its behaviour. */
  readonly issue: string;

  constructor(issue: string, action: string) {
    super(
      `Authorization for "${action}" is in place, but the action itself is not built yet. ` +
        `${issue} implements it.`,
    );
    this.name = "ActionNotImplemented";
    this.issue = issue;
  }
}

export function notImplemented(issue: string, action: string): never {
  throw new ActionNotImplemented(issue, action);
}
