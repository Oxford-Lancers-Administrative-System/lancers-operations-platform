// What Administration's server actions hand back to the screens — LAN-133.
// A refusal (LAN133-BRIAN-1) is never `error` or an exception — see relocations.md.
export interface CandidateChoice {
  readonly personId: string;
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly matchedOn: readonly string[];
  readonly operatorState: string | null;
  readonly operatorAccountId: string | null;
}

export interface AdminActionState {
  readonly error: string | null;
  readonly notice: string | null;
  readonly candidates: readonly CandidateChoice[] | null;
  readonly refusal: string | null;
}

export const EMPTY_ADMIN_ACTION_STATE: AdminActionState = Object.freeze({
  error: null,
  notice: null,
  candidates: null,
  refusal: null,
});
