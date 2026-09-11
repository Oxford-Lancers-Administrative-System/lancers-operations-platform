"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import ListItemText from "@mui/material/ListItemText";
import { Field } from "@/components/field";

import { MIN_QUERY_LENGTH, type VenueSuggestion } from "@/lib/venue-search/suggestion";

// The event editor's venue field — LAN-115. `freeSolo`: whatever the
// operator types is submitted, matched or not (the club's own pitches are
// exactly what a geocoder has never heard of). Stale results are dropped by
// sequence ticket, checked twice (headers, then body). Controlled since
// LAN-154, for the Type-change venue swap (D41). Failure never blocks the
// form — only a helper-text sentence.

/** Long enough for a few requests, not twenty-five — the club's half of fair use on a free geocoder. */
export const DEBOUNCE_MS = 300;

type SearchStatus =
  "idle" | "searching" | "results" | "empty" | "rate_limited" | "provider_error" | "unavailable";

const DEFAULT_HELP = "Search for a place or address, or just type where it is.";

const STATUS_MESSAGE: Readonly<Record<SearchStatus, string>> = Object.freeze({
  idle: DEFAULT_HELP,
  searching: "Searching for matching places…",
  results: "Choose a place, or keep typing your own.",
  empty: "No matching place found. Type the venue yourself.",
  rate_limited: "Address search is busy right now. Wait a moment, or type the venue yourself.",
  provider_error: "Address search is unavailable right now. Type the venue yourself.",
  unavailable: "Address search is not set up here. Type the venue yourself.",
});

function readOutcome(payload: unknown): {
  status: SearchStatus;
  suggestions: readonly VenueSuggestion[];
} {
  if (typeof payload !== "object" || payload === null) {
    return { status: "provider_error", suggestions: [] };
  }
  const status = (payload as { status?: unknown }).status;
  if (status === "rate_limited") return { status: "rate_limited", suggestions: [] };
  if (status === "unavailable") return { status: "unavailable", suggestions: [] };
  if (status !== "ok") return { status: "provider_error", suggestions: [] };

  const suggestions = (payload as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(suggestions)) return { status: "provider_error", suggestions: [] };

  return {
    status: suggestions.length === 0 ? "empty" : "results",
    suggestions: suggestions as readonly VenueSuggestion[],
  };
}

export default function VenueField({
  name,
  value,
  onValueChange,
  errorMessage,
}: {
  name: string;
  value: string;
  onValueChange: (value: string) => void;
  errorMessage?: string;
}) {
  const inputValue = value;
  const setInputValue = onValueChange;
  const [suggestions, setSuggestions] = useState<readonly VenueSuggestion[]>([]);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [open, setOpen] = useState(false);

  // The ticket dispenser — incremented for every search and every reason one stops mattering.
  const sequenceRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  // The venue already showing, vs. one being typed — seeded with the stored
  // value so opening Edit doesn't search the provider for its own display.
  const chosenRef = useRef<string | null>(value.trim() === "" ? null : value.trim());

  const run = useCallback(async (query: string) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const ticket = (sequenceRef.current += 1);

    setStatus("searching");

    try {
      const response = await fetch(`/api/venue-search?q=${encodeURIComponent(query)}`, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });

      if (ticket !== sequenceRef.current) return;

      if (!response.ok) {
        setSuggestions([]);
        setStatus(response.status === 429 ? "rate_limited" : "provider_error");
        return;
      }

      const payload: unknown = await response.json();

      // Checked again — reading the body is a second await.
      if (ticket !== sequenceRef.current) return;

      const outcome = readOutcome(payload);
      setSuggestions(outcome.suggestions);
      setStatus(outcome.status);
    } catch {
      if (ticket !== sequenceRef.current) return;
      setSuggestions([]);
      setStatus("provider_error");
    }
  }, []);

  useEffect(() => {
    const query = inputValue.trim();

    if (query.length < MIN_QUERY_LENGTH || query === chosenRef.current) {
      controllerRef.current?.abort();
      sequenceRef.current += 1;
      setSuggestions([]);
      setStatus("idle");
      return;
    }

    const handle = setTimeout(() => void run(query), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [inputValue, run]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const help = errorMessage ?? STATUS_MESSAGE[status];

  return (
    <Autocomplete<VenueSuggestion, false, false, true>
      freeSolo
      data-field={name}
      data-testid="venue-field"
      options={suggestions}
      filterOptions={(options) => options}
      getOptionLabel={(option) => (typeof option === "string" ? option : option.formatted)}
      isOptionEqualToValue={(option, value) =>
        option.formatted === (typeof value === "string" ? value : value.formatted)
      }
      inputValue={inputValue}
      onInputChange={(_event, next) => setInputValue(next)}
      onChange={(_event, next) => {
        if (next === null || typeof next === "string") return;
        chosenRef.current = next.formatted;
        setInputValue(next.formatted);
        setSuggestions([]);
        setStatus("idle");
      }}
      loading={status === "searching"}
      loadingText={STATUS_MESSAGE.searching}
      noOptionsText={STATUS_MESSAGE.empty}
      // Opens only when non-empty (avoids a flicker); closes on Escape via `open` state.
      open={open && suggestions.length > 0}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      renderOption={({ key, ...optionProps }, option) => (
        <li key={key} {...optionProps}>
          <ListItemText
            primary={option.label}
            secondary={option.detail === "" ? undefined : option.detail}
          />
        </li>
      )}
      renderInput={(params) => (
        <Field
          {...params}
          label="Venue"
          name={name}
          error={Boolean(errorMessage)}
          helperText={<span data-testid="venue-search-status">{help}</span>}
          slotProps={{ ...params.slotProps, formHelperText: { "aria-live": "polite" } }}
        />
      )}
      fullWidth
    />
  );
}
