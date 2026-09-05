import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PublicShell } from "./public-shell";

describe("PublicShell", () => {
  it("renders the masthead with the club's name and one main landmark (G3)", () => {
    render(
      <PublicShell caption="Sign in" width="narrow">
        <p>form</p>
      </PublicShell>,
    );
    expect(screen.getByRole("banner")).toHaveTextContent("Oxford Lancers");
    expect(screen.getByRole("banner")).toHaveTextContent("Sign in");
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("main")).toHaveTextContent("form");
  });
});
