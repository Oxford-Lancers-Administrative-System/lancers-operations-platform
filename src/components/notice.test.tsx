import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Notice, REFUSAL_TITLE } from "./notice";

describe("Notice", () => {
  it("renders an outcome at its severity", () => {
    render(
      <Notice severity="success" testId="n">
        Saved.
      </Notice>,
    );
    expect(screen.getByTestId("n")).toHaveTextContent("Saved.");
    expect(screen.getByTestId("n").className).toMatch(/MuiAlert-colorSuccess/);
  });

  it("renders a refusal as a warning with the fixed title and the guard's own sentence", () => {
    render(
      <Notice variant="refusal" testId="r">
        This action affects the President.
      </Notice>,
    );
    const notice = screen.getByTestId("r");
    expect(notice).toHaveTextContent(REFUSAL_TITLE);
    expect(notice).toHaveTextContent("This action affects the President.");
    expect(notice.className).toMatch(/MuiAlert-colorWarning/);
    expect(notice.className).not.toMatch(/Error/);
  });
});
