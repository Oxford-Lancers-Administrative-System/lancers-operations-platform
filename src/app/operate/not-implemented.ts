// Deliberately not a ServiceError.
export class ActionNotImplemented extends Error {
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
