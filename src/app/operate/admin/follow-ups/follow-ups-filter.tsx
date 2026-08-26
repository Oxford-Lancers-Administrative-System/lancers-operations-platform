"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import { useFilterSearch } from "@/app/operate/filter-search";
import { SEARCH_LABEL } from "./presentation";

/**
 * W5's own search box, reusing `useFilterSearch` for the same reason every
 * other filtered table in the operator shell does: filtering as you type, and
 * never dropping what was typed inside the debounce window.
 */
export default function FollowUpsFilter({
  basePath,
  search,
}: {
  basePath: string;
  search: string;
}) {
  const router = useRouter();
  const push = useCallback((href: string) => router.push(href), [router]);

  const { typed, setTyped } = useFilterSearch({
    search,
    basePath,
    filters: {},
    push,
  });

  return (
    <Box component="form" method="get" action={basePath} data-testid="follow-ups-filters">
      <TextField
        label={SEARCH_LABEL}
        name="q"
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        size="small"
        sx={{ width: { xs: "100%", sm: 320 } }}
      />
    </Box>
  );
}
