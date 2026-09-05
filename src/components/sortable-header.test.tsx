import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { SortableHeader, TableFrame } from "./sortable-header";

describe("SortableHeader", () => {
  it("is a link carrying the sort, not a button, and says which way it sorts", () => {
    render(
      <TableFrame>
        <Table>
          <TableHead>
            <TableRow>
              <SortableHeader
                column="name"
                label="Name"
                href="/x?sort=name&dir=desc"
                active
                direction="asc"
              />
            </TableRow>
          </TableHead>
        </Table>
      </TableFrame>,
    );
    const link = screen.getByRole("link", { name: /Name/ });
    expect(link).toHaveAttribute("href", "/x?sort=name&dir=desc");
    expect(link).toHaveAttribute("data-sort", "name");
    expect(link.querySelector("button")).toBeNull();
    expect(screen.getByRole("columnheader")).toHaveAttribute("aria-sort", "ascending");
  });
});
