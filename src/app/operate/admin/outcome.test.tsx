/**
 * How Administration reports an outcome — LAN133-BRIAN-1 and LAN133-BRIAN-3.
 *
 * Both rules came out of Brian's review of `WP-surfaces` and both are the kind
 * that decay quietly: a refusal styled as an error still *looks* handled, and a
 * stale confirmation still *looks* like a confirmation. So each is asserted for
 * what the operator can actually tell apart — the words, and which panel the
 * message belongs to — rather than for the shape of the state object.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { EMPTY_ADMIN_ACTION_STATE, type AdminActionState } from "./action-state";
import AdminOutcome, { ArrivalNotice, OutcomeSlotProvider, useOutcomeSlot } from "./outcome";

function state(overrides: Partial<AdminActionState>): AdminActionState {
  return { ...EMPTY_ADMIN_ACTION_STATE, ...overrides };
}

describe("a refusal is shown, and shown as a rule", () => {
  const REFUSAL =
    "This action affects the President. Only the General Manager role may assign this role for that seat.";

  it("renders the guard's own sentence", () => {
    render(<AdminOutcome state={state({ refusal: REFUSAL })} />);

    expect(screen.getByTestId("admin-refusal")).toHaveTextContent(REFUSAL);
  });

  /**
   * The distinction the operator has to be able to make. An error invites a
   * retry; a refusal is the club's rules and retrying cannot change it. They
   * are never the same element.
   */
  it("is not rendered as an error the operator could retry", () => {
    render(<AdminOutcome state={state({ refusal: REFUSAL })} />);

    expect(screen.queryByTestId("admin-error")).toBeNull();
    expect(screen.getByTestId("admin-refusal")).toHaveTextContent("Not permitted");
  });

  it("outranks anything else the action came back with", () => {
    render(
      <AdminOutcome state={state({ refusal: REFUSAL, notice: "Sent", error: "Bad address" })} />,
    );

    expect(screen.getByTestId("admin-refusal")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-notice")).toBeNull();
    expect(screen.queryByTestId("admin-error")).toBeNull();
  });

  it("still tells an ordinary failure apart from a success", () => {
    const { unmount } = render(
      <AdminOutcome state={state({ error: "That address is not valid." })} />,
    );
    expect(screen.getByTestId("admin-error")).toBeInTheDocument();
    unmount();

    render(<AdminOutcome state={state({ notice: "The invitation has been sent again." })} />);
    expect(screen.getByTestId("admin-notice")).toBeInTheDocument();
  });
});

describe("a screen shows the result of at most one action", () => {
  /** Two panels that have each already produced a confirmation. */
  function Panel({ name, notice }: { name: string; notice: string }) {
    const slot = useOutcomeSlot(name);
    return (
      <form onSubmit={slot.claim} data-testid={`form-${name}`}>
        <button type="submit">Run {name}</button>
        <AdminOutcome state={state({ notice })} showing={slot.showing} />
      </form>
    );
  }

  function Screen() {
    return (
      <OutcomeSlotProvider>
        <Panel name="resend" notice="The invitation has been sent again" />
        <Panel
          name="correct"
          notice="The invitation has been sent again, to somebody@example.test"
        />
      </OutcomeSlotProvider>
    );
  }

  it("shows both only until one of them is started", () => {
    render(<Screen />);

    // Nothing has claimed the slot yet, so neither panel is suppressing the
    // other — this is the state a freshly loaded screen is in.
    expect(screen.getByText("The invitation has been sent again")).toBeInTheDocument();
  });

  /**
   * The defect Brian raised twice: "The invitation has been sent again" sat
   * under Resend while a second, differently worded confirmation sat under
   * Correct and resend, and both read as though they had just happened.
   */
  it("clears the other panel's result when an action is started", () => {
    render(<Screen />);

    fireEvent.submit(screen.getByTestId("form-correct"));

    expect(
      screen.getByText("The invitation has been sent again, to somebody@example.test"),
    ).toBeInTheDocument();
    expect(screen.queryByText("The invitation has been sent again")).toBeNull();
  });

  it("hands the slot on when a different action is started", () => {
    render(<Screen />);

    fireEvent.submit(screen.getByTestId("form-correct"));
    fireEvent.submit(screen.getByTestId("form-resend"));

    expect(screen.getByText("The invitation has been sent again")).toBeInTheDocument();
    expect(
      screen.queryByText("The invitation has been sent again, to somebody@example.test"),
    ).toBeNull();
  });

  /**
   * The path the page itself instructs — LAN133-F2.
   *
   * `inviteOperatorAction` redirects with a `notice` parameter whose banner says
   * to correct the address and send it again. `correctInvitationAction` refreshes
   * without redirecting, so the parameter survives and its banner used to sit
   * above the panel's fresh confirmation: two results, both reading as current,
   * reached by following the instruction. The arrival notice is inside the slot
   * now, and this is what holds it there.
   */
  it("clears a notice the page arrived with once an action is started", () => {
    function Screen() {
      return (
        <OutcomeSlotProvider>
          <ArrivalNotice
            severity="warning"
            message="The account and the role are recorded, but the invitation could not be delivered."
          />
          <Panel name="correct" notice="The invitation has been sent again, to a@example.test" />
        </OutcomeSlotProvider>
      );
    }

    render(<Screen />);
    expect(screen.getByTestId("arrival-notice")).toBeInTheDocument();

    fireEvent.submit(screen.getByTestId("form-correct"));

    expect(screen.queryByTestId("arrival-notice")).toBeNull();
    expect(
      screen.getByText("The invitation has been sent again, to a@example.test"),
    ).toBeInTheDocument();
  });

  /** A screen with one action needs no provider and must not need one. */
  it("shows a lone panel's result with no provider at all", () => {
    function Alone() {
      const slot = useOutcomeSlot("only");
      return <AdminOutcome state={state({ notice: "Done" })} showing={slot.showing} />;
    }
    render(<Alone />);

    expect(screen.getByTestId("admin-notice")).toHaveTextContent("Done");
  });
});
