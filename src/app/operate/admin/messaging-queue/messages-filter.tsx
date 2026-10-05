"use client";

import { useRouter } from "next/navigation";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import { Field } from "@/components/field";
import { SIDEWAYS_PHONE } from "@/theme-tokens";
import {
  CHANNEL_FILTERS,
  KIND_FAMILY_KEYS,
  STATUS_FILTERS,
  WINDOWS,
} from "@/lib/services/message-queue-vocabulary";
import {
  ALL,
  CHANNEL_FILTER_LABELS,
  KIND_FAMILY_LABELS,
  MESSAGES_PATH,
  STATUS_FILTER_LABELS,
  WINDOW_LABELS,
} from "./presentation";
import { messagesHref, type MessagesQuery } from "./query";

/**
 * Four selects: window, status, channel, kind. Each navigates on its own
 * change, as the Follow-ups filters do, and a new filter starts at page one.
 * Below `sm` each takes its own full-width row.
 */
const FILTER_SX = {
  width: { xs: "100%", sm: "auto" },
  minWidth: { sm: 180 },
  flex: { sm: "1 1 0", lg: "0 1 220px" },
  [SIDEWAYS_PHONE]: { minWidth: 160, flex: "1 1 0" },
};

export default function MessagesFilter({ query }: { query: MessagesQuery }) {
  const router = useRouter();
  const go = (patch: Partial<MessagesQuery>) =>
    router.push(messagesHref(MESSAGES_PATH, { ...query, ...patch, page: 1 }));

  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={2}
      useFlexGap
      sx={{ flexWrap: { sm: "wrap" } }}
      data-testid="messages-filters"
    >
      <Field
        select
        label="When"
        name="window"
        value={query.window}
        onChange={(event) => go({ window: event.target.value as MessagesQuery["window"] })}
        sx={FILTER_SX}
      >
        {WINDOWS.map((value) => (
          <MenuItem key={value} value={value}>
            {WINDOW_LABELS[value]}
          </MenuItem>
        ))}
      </Field>
      <Field
        select
        label="Status"
        name="status"
        value={query.status ?? ""}
        onChange={(event) =>
          go({ status: (event.target.value || null) as MessagesQuery["status"] })
        }
        sx={FILTER_SX}
      >
        <MenuItem value="">{ALL}</MenuItem>
        {STATUS_FILTERS.map((value) => (
          <MenuItem key={value} value={value}>
            {STATUS_FILTER_LABELS[value]}
          </MenuItem>
        ))}
      </Field>
      <Field
        select
        label="Channel"
        name="channel"
        value={query.channel ?? ""}
        onChange={(event) =>
          go({ channel: (event.target.value || null) as MessagesQuery["channel"] })
        }
        sx={FILTER_SX}
      >
        <MenuItem value="">{ALL}</MenuItem>
        {CHANNEL_FILTERS.map((value) => (
          <MenuItem key={value} value={value}>
            {CHANNEL_FILTER_LABELS[value]}
          </MenuItem>
        ))}
      </Field>
      <Field
        select
        label="Message"
        name="kind"
        value={query.kind ?? ""}
        onChange={(event) => go({ kind: (event.target.value || null) as MessagesQuery["kind"] })}
        sx={FILTER_SX}
      >
        <MenuItem value="">{ALL}</MenuItem>
        {KIND_FAMILY_KEYS.map((value) => (
          <MenuItem key={value} value={value}>
            {KIND_FAMILY_LABELS[value]}
          </MenuItem>
        ))}
      </Field>
    </Stack>
  );
}
