import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Button from "@mui/material/Button";
import { BackLink, PageHeader } from "./page-header";

describe("PageHeader", () => {
  it("renders one h1, the subtitle, the back link and the actions", () => {
    render(
      <PageHeader
        title="Operators"
        subtitle="2026-27 · 8 operator accounts"
        back={{ href: "/operate/admin", label: "Back to administration" }}
        actions={<Button variant="contained">Invite operator</Button>}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Operators");
    expect(screen.getByTestId("page-subtitle")).toHaveTextContent("8 operator accounts");
    expect(screen.getByTestId("back-link")).toHaveAttribute("href", "/operate/admin");
    expect(screen.getByTestId("page-actions")).toHaveTextContent("Invite operator");
  });

  it("writes the back link as sentence-case text, never an arrow", () => {
    render(<BackLink href="/operate/roster" label="Back to roster" />);
    const link = screen.getByTestId("back-link");
    expect(link).toHaveTextContent("Back to roster");
    expect(link).not.toHaveTextContent("←");
  });
});
