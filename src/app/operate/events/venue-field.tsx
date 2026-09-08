"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import ListItemText from "@mui/material/ListItemText";
import { Field } from "@/components/field";

import { MIN_QUERY_LENGTH, type VenueSuggestion } from "@/lib/venue-search/suggestion";

/**
 * The event editor's venue field — LAN-115.
 *
 * A searchable place/address combobox that is still, underneath, the free-text
 * field LAN-76 shipped. That is the whole design, and every decision below
 * follows from it.
 *
 * ## Free text is the field; search is an assistance on top of it
 *
 * The control is `freeSolo`, so whatever the operator types is what gets
 * submitted, whether or not it matches anything. LAN-115 requires that
 * explicitly — "preserve a manual text fallback when the provider is
 * unavailable or an Oxford field/location is not indexed, so an operator can
 * still save a draft" — and the club's own pitches are exactly the kind of
 * place a geocoder has never heard of. A combobox that refused an unmatched
 * value would make the provider's index an authority on where the Lancers
 * train, which it is not.
 *
 * So the field posts one `name="venue"` input, the same as before, carrying
 * either the formatted address of a chosen suggestion or the operator's own
 * words. Nothing downstream — the action, the validation, the service, the
 * column, the three screens that display it — knows which.
 *
 * ## Stale results, and why a sequence number rather than only an abort
 *
 * "A slow earlier query cannot overwrite a later query's results" is an
 * acceptance criterion, and aborting the previous request does not on its own
 * satisfy it: an abort is a request to stop, delivered asynchronously, and a
 * response already in flight can still resolve afterwards. Every search
 * therefore takes a ticket from `sequenceRef`, and the handler drops anything
 * that is not the current one — checked twice, after the headers and again
 * after the body, because the body is a second await and the world moves during
 * it. The abort is kept as well, so the club stops paying for answers nobody
 * will read.
 *
 * ## Controlled, since LAN-154
 *
 * The value lives in the form rather than here. Changing an event's **Type**
 * replaces the venue the old type's template supplied — but only where nobody
 * has edited it (D41) — and a field holding its own copy could neither be told
 * nor asked. Nothing else about the control changed: it still posts one
 * `name="venue"` input carrying whatever is in it.
 *
 * ## Failure never reaches the operator as a failure
 *
 * There is no state in which this component prevents the form being filled in
 * or saved. A provider that is down, rate-limiting, unconfigured or simply
 * ignorant of the place produces a sentence under the field and a still-typable
 * input. The sentence lives in the helper-text line with `aria-live`, so it is
 * announced when it changes under somebody who is typing rather than only being
 * visible.
 */

/**
 * How long the field waits after the last keystroke.
 *
 * Long enough that typing "Iffley Road Sports Ground" is a few requests rather
 * than twenty-five, short enough not to feel broken. This is the club's half of
 * fair use on a free public geocoder; see `src/lib/venue-search/photon.ts`.
 */
export const DEBOUNCE_MS = 300;

/** What the field is currently able to tell the operator. */
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

/** The response shape the endpoint promises. Anything else is a failure. */
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
  /** The form field name. `venue`, so the action reads it exactly as before. */
  name: string;
  /** The venue as the form currently holds it. Controlled — see below. */
  value: string;
  /** Called with every keystroke and with a chosen suggestion. */
  onValueChange: (value: string) => void;
  /** A validation correction from the action, which outranks any search state. */
  errorMessage?: string;
}) {
  const inputValue = value;
  const setInputValue = onValueChange;
  const [suggestions, setSuggestions] = useState<readonly VenueSuggestion[]>([]);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [open, setOpen] = useState(false);

  // The ticket dispenser. Incremented for every search *and* for every reason a
  // search stops mattering, so an in-flight response is invalidated by the
  // operator clearing the field just as surely as by a newer query.
  const sequenceRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  // The venue the field is already showing, as opposed to one being typed.
  //
  // Seeded with the stored value, which matters on the edit screen: a venue
  // loaded from the database is indistinguishable from one just typed unless
  // something says otherwise, so opening **Edit** would search the provider for
  // the address it had itself just displayed — a request per page load, on a
  // free service, for an answer nobody asked for. It is updated when a
  // suggestion is chosen, for the same reason in the other direction.
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

      // Checked again: reading the body is a second await, and a newer query
      // may have been issued and answered while it was happening.
      if (ticket !== sequenceRef.current) return;

      const outcome = readOutcome(payload);
      setSuggestions(outcome.suggestions);
      setStatus(outcome.status);
    } catch {
      // An abort lands here too, and is not something to tell anyone about.
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

  // Nothing is in flight once the form is gone.
  useEffect(() => () => controllerRef.current?.abort(), []);

  const help = errorMessage ?? STATUS_MESSAGE[status];

  return (
    <Autocomplete<VenueSuggestion, false, false, true>
      freeSolo
      data-field={name}
      data-testid="venue-field"
      options={suggestions}
      // The provider has already decided what matches; filtering the list a
      // second time in the browser would hide results it deliberately returned.
      filterOptions={(options) => options}
      getOptionLabel={(option) => (typeof option === "string" ? option : option.formatted)}
      // `freeSolo` means the current value may be the operator's own words
      // rather than a suggestion, which is precisely the case that must not
      // throw while comparing.
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
      // The list opens only when there is something in it, and closes when the
      // operator dismisses it with Escape. Without the emptiness condition an
      // empty popup flickers under every third keystroke; without the state it
      // could not be dismissed and re-opened by keyboard alone.
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
