"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import {
  AVAILABILITY,
  BLUES,
  bandOf,
  COACH_GROUPS,
  DEFENCE_POSITIONS,
  ELIGIBILITY,
  ENTRIES,
  OFFENCE_POSITIONS,
  POSITION_LABELS,
  SPECIAL_TEAMS_POSITIONS,
  STATUSES,
} from "./columns";
import { ONBOARDING_STATUSES, type Row, SEASON_LABEL } from "./fixtures";
import JerseyPicker from "./jersey-picker";

/**
 * W6 — one player's record for one season.
 *
 * ## The one thing this page is for
 *
 * Telling a **durable person fact from a seasonal one**, without being told
 * which is which. A player with four seasons has one person record and four of
 * these, and if the page does not make that visible then every question about
 * "what do we know about them" gets answered against the wrong scope.
 *
 * The banding does the work: Person, Onboarding, Season, the same three groups
 * and the same colours as the board, so the two surfaces read as one product
 * and a field's group is never a guess.
 *
 * ## Who may change what, and where
 *
 * **Season facts edit in place**, with the board's interaction — one click, a
 * dropdown only where the value set is fixed, commits on its own, and an audit
 * event written without asking a reason.
 *
 * **Person facts render and route to the person record.** A durable fact is
 * editable in **exactly one place** in this mission. The board, this page and
 * the People list all show those facts and all route to the same place to
 * change them, because three edit paths writing one field would mean `W2`'s
 * reason-and-supersede rule either followed them everywhere or quietly did not
 * apply.
 *
 * **Onboarding items edit the same way as everything else.** The per-item
 * `Resolve … ▾` / `SAVE` pair was retired on 2026-08-27. Mission 7 still owns
 * what the items mean and when they block activation; this changes how one is
 * set, not what it does.
 *
 * ## What this page shows that no list may
 *
 * Date of birth and emergency contact. Task 08 §6 keeps both off every list,
 * and they render here. This is the most complete view of one human in the
 * application, which is why it is four-role only and why the coach refusal is
 * explicit rather than incidental.
 */
export default function PlayerRecord({
  row,
  grants,
  jerseyHolders,
  onCommit,
  onBack,
}: {
  row: Row;
  readonly grants: readonly string[];
  jerseyHolders: Record<string, ReadonlyMap<string, string>>;
  /** Same signature the board commits through, so both write one audit stream. */
  onCommit: (row: Row, field: string, key: string, next: string | string[]) => void;
  onBack: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);

  /**
   * A departed or archived membership renders **complete and read-only**, with
   * the activation control absent rather than disabled. A disabled control
   * invites the question of how to enable it; an absent one answers it. Nothing
   * about a past season is editable from here.
   */
  const closed = row.status === "Departed" || row.status === "Archived";

  const resolved = row.onboardingItems.filter((item) =>
    ["Complete", "Waived", "Not applicable"].includes(item.status),
  ).length;

  /**
   * The Blues total the club actually looks at, derived across seasons rather
   * than stored. Half and Full Blue are seasonal awards — two flags on the
   * season record — and the cumulative figure is a reading of history.
   */
  const bluesTotal =
    row.otherSeasons.filter((season) => season.blues !== null).length + (row.blues && row.blues !== "None" ? 1 : 0);

  /**
   * Constitutional membership, derived. An existing view on `main` computes it;
   * the rule reproduced here is the shape, not the authority.
   */
  const constitutional = row.otherSeasons.length + 1 >= 2;

  /**
   * A multi-value field commits without closing.
   *
   * Ticking a second position or a second jersey number is one continuous act,
   * so the list stays open across picks and closes on the gestures that mean
   * "finished" — a click outside, the arrow, or Escape. This is the board's
   * behaviour, and the two surfaces must not disagree about how the same
   * control works.
   */
  const change = (key: string, field: string, next: string | string[]) => {
    onCommit(row, field, key, next);
  };

  /** A single-value field commits and closes in one click. */
  const edit = (key: string, field: string, next: string | string[]) => {
    change(key, field, next);
    setEditing(null);
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {row.displayName}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {`${SEASON_LABEL} membership · ${row.entry} · ${row.status}`}
        </Typography>
      </Box>

      {/* The figures an operator opens this page to check, before reading it. */}
      <Stack direction="row" spacing={4} sx={{ flexWrap: "wrap", gap: 3 }}>
        <Summary label="Membership">
          <Chip size="small" color={STATUS_COLOUR[row.status] ?? "default"} label={row.status} />
        </Summary>
        <Summary label="Onboarding items resolved">
          {row.onboardingItems.length === 0
            ? "No items configured"
            : `${resolved} of ${row.onboardingItems.length}`}
        </Summary>
        <Summary label="Entry">{row.entry}</Summary>
        <Summary label="Blues total · all seasons">{bluesTotal === 0 ? "None" : bluesTotal}</Summary>
        <Summary label="Constitutional member">{constitutional ? "Yes" : "No"}</Summary>
        {row.missing > 0 ? (
          <Summary label="Missing required data">
            <Chip size="small" color="warning" variant="outlined" label={`${row.missing} fields`} />
          </Summary>
        ) : null}
      </Stack>

      {/* ------------------------------------------------------------ Person -- */}
      <Section
        band="person"
        title="Person"
        action="Open the person record →"
        // Durable across every season this human ever holds. Changing one is an
        // override, and W2 owns what that costs — a reason when a value is
        // replaced, contacts superseding rather than overwriting.
        caption="Durable facts. Edited on the person record, under W2's rules."
      >
        <Field label="Name" value={row.displayName} onRecord />
        <Field label="Aliases" value={row.aliases.join(", ")} onRecord />
        <Field label="Mobile phone" value={row.mobile} onRecord />
        <Field label="Personal email" value={row.email} onRecord />
        <Field label="College" value={row.college} onRecord />
        <Field label="Matriculation year" value={row.matriculation} onRecord />
        <Field label="Expected graduation" value={row.graduation} onRecord />
        <Field label="Degree field" value={row.degree} onRecord />
        {/* Renders here and on no list. */}
        <Field label="Date of birth" value={row.dateOfBirth} onRecord />
        <Field
          label="Emergency contact"
          value={row.emergencyContact}
          onRecord
          note="Never on a list, never a contact point, out of leadership exports by default"
        />
      </Section>

      {/* -------------------------------------------------------- Onboarding -- */}
      <Section
        band="onboarding"
        title="Onboarding"
        caption="Mission 7 owns what these mean and when they block activation."
      >
        {row.onboardingItems.length === 0 ? (
          // A real configuration state, not a failure, and it says so in its own
          // words rather than reading as incomplete.
          <Typography color="text.secondary" sx={{ py: 2 }}>
            No onboarding items are configured for this membership.
          </Typography>
        ) : (
          row.onboardingItems.map((item, index) => (
            <Field
              key={item.label}
              label={item.label}
              value={item.status}
              // Per-item provenance, which W6 requires shown rather than just
              // the state — who set it and when.
              note={`${item.recordedBy} · ${item.recordedOn}${item.required ? " · required" : ""}`}
              options={ONBOARDING_STATUSES}
              editing={editing === `item:${index}`}
              readOnly={closed}
              onOpen={() => setEditing(`item:${index}`)}
              onClose={() => setEditing(null)}
              onCommit={(next) => {
                const items = row.onboardingItems.map((entry, at) =>
                  at === index ? { ...entry, status: next as string } : entry,
                );
                edit("onboardingItems", item.label, items as never);
              }}
            />
          ))
        )}
      </Section>

      {/* ------------------------------------------------------------ Season -- */}
      <Section
        band="season"
        title={`Season · ${SEASON_LABEL}`}
        caption={
          closed
            ? "This season is closed. Nothing here is editable."
            : "Season facts. One click edits; the change commits on its own."
        }
      >
        <Field
          label="Status"
          value={row.status}
          chip={STATUS_COLOUR[row.status]}
          options={STATUSES}
          editing={editing === "status"}
          readOnly={closed}
          onOpen={() => setEditing("status")}
          onClose={() => setEditing(null)}
          onCommit={(next) => edit("status", "Status", next)}
        />
        <Field
          label="Entry"
          value={row.entry}
          options={ENTRIES}
          editing={editing === "entry"}
          readOnly={closed}
          onOpen={() => setEditing("entry")}
          onClose={() => setEditing(null)}
          onCommit={(next) => edit("entry", "Entry", next)}
        />
        {/* Milestones, not fields. They are written by the status events that
            caused them and are never typed in. */}
        <Field label="Confirmed" value={row.confirmedOn} readOnly />
        <Field label="Activated" value={row.activatedOn} readOnly />

        <Field
          label="Offence positions"
          value={row.offencePositions.join(", ")}
          options={OFFENCE_POSITIONS}
          optionLabels={POSITION_LABELS}
          multiple
          selected={row.offencePositions}
          editing={editing === "offencePositions"}
          readOnly={closed}
          onOpen={() => setEditing("offencePositions")}
          onClose={() => setEditing(null)}
          onCommit={(next) => change("offencePositions", "Offence", next)}
        />
        <Field
          label="Defence positions"
          value={row.defencePositions.join(", ")}
          options={DEFENCE_POSITIONS}
          optionLabels={POSITION_LABELS}
          multiple
          selected={row.defencePositions}
          editing={editing === "defencePositions"}
          readOnly={closed}
          onOpen={() => setEditing("defencePositions")}
          onClose={() => setEditing(null)}
          onCommit={(next) => change("defencePositions", "Defence", next)}
        />
        <Field
          label="Special teams"
          value={row.specialTeams.join(", ")}
          options={SPECIAL_TEAMS_POSITIONS}
          optionLabels={POSITION_LABELS}
          multiple
          selected={row.specialTeams}
          editing={editing === "specialTeams"}
          readOnly={closed}
          onOpen={() => setEditing("specialTeams")}
          onClose={() => setEditing(null)}
          onCommit={(next) => change("specialTeams", "Special teams", next)}
        />

        {/* The same picker the board uses, and the same season-wide holder map
            — so a number taken from either surface is taken on both. */}
        <JerseyField
          label="Jersey — Blue"
          held={row.blueNumbers}
          holders={jerseyHolders.blue}
          ownerName={row.displayName}
          editing={editing === "blueNumbers"}
          readOnly={closed}
          onOpen={() => setEditing("blueNumbers")}
          onClose={() => setEditing(null)}
          onCommit={(next) => change("blueNumbers", "Blue #", next)}
        />
        <JerseyField
          label="Jersey — White"
          held={row.whiteNumbers}
          holders={jerseyHolders.white}
          ownerName={row.displayName}
          editing={editing === "whiteNumbers"}
          readOnly={closed}
          onOpen={() => setEditing("whiteNumbers")}
          onClose={() => setEditing(null)}
          onCommit={(next) => change("whiteNumbers", "White #", next)}
        />

        <Field
          label="Coach group"
          value={row.coachGroup}
          options={COACH_GROUPS}
          editing={editing === "coachGroup"}
          readOnly={closed}
          onOpen={() => setEditing("coachGroup")}
          onClose={() => setEditing(null)}
          onCommit={(next) => edit("coachGroup", "Coach group", next)}
        />
        <Field
          label="Formalwear"
          // Seasonal, reasked each season rather than carried — which removes
          // Task 10 item 3's "not applicable if already recorded" carve-out for
          // returners. The checklist regenerates for everyone every season.
          value={row.formalwear.join(", ")}
          note="Seasonal — reasked each season, never carried forward"
          options={["Tie", "Bowtie", "Socks"]}
          multiple
          selected={row.formalwear}
          editing={editing === "formalwear"}
          readOnly={closed}
          onOpen={() => setEditing("formalwear")}
          onClose={() => setEditing(null)}
          onCommit={(next) => change("formalwear", "Formalwear", next)}
        />
        <Field
          label="Half / Full Blue"
          value={row.blues}
          note="This season's award. The total across seasons is derived, above."
          options={BLUES}
          editing={editing === "blues"}
          readOnly={closed}
          onOpen={() => setEditing("blues")}
          onClose={() => setEditing(null)}
          onCommit={(next) => edit("blues", "Blues", next)}
        />
        <Field
          label="Eligibility"
          value={row.eligibility}
          note="Mission 11 owns the records — competition, authority, evidence, dates"
          options={ELIGIBILITY}
          editing={editing === "eligibility"}
          readOnly={closed}
          onOpen={() => setEditing("eligibility")}
          onClose={() => setEditing(null)}
          onCommit={(next) => edit("eligibility", "Eligibility", next)}
        />
        {/* Grant-gated exactly as on the board: absent without the grant, not
            hidden. */}
        {grants.includes("availability_read") ? (
          <Field
            label="Availability"
            value={row.availability}
            options={AVAILABILITY}
            editing={editing === "availability"}
            readOnly={closed}
            onOpen={() => setEditing("availability")}
            onClose={() => setEditing(null)}
            onCommit={(next) => edit("availability", "Availability", next)}
          />
        ) : null}
      </Section>

      {/* ---------------------------------------------------- Other seasons -- */}
      <Section
        band="person"
        title="Their other seasons"
        caption="One person, one record, and one of these pages per season."
      >
        {row.otherSeasons.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 2 }}>
            {row.entry === "New"
              ? "First season with the club."
              : "No earlier seasons are recorded."}
          </Typography>
        ) : (
          row.otherSeasons.map((season) => (
            <Stack
              key={season.label}
              direction="row"
              sx={{
                justifyContent: "space-between",
                alignItems: "center",
                py: 1.25,
                borderBottom: 1,
                borderColor: "divider",
              }}
            >
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 700, color: "primary.main" }}>
                  {season.label}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {[season.jersey, season.blues ? `${season.blues} Blue` : null]
                    .filter(Boolean)
                    .join(" · ") || "Nothing recorded"}
                </Typography>
              </Box>
              <Chip size="small" label={season.status} />
            </Stack>
          ))
        )}
      </Section>

      {/* --------------------------------------------------------- History -- */}
      <Section
        band="person"
        title="What changed"
        action="Everything that changed about this person →"
        caption="This membership's events. The person's full history lives on their record."
      >
        {row.history.map((event, index) => (
          <Box key={index} sx={{ py: 1.25, borderBottom: 1, borderColor: "divider" }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {event.field}
            </Typography>
            <Typography variant="body2">{event.summary}</Typography>
            <Typography variant="caption" color="text.secondary">
              {`${event.when} · ${event.actor}`}
              {/* A reason appears where one was required — replacing a durable
                  person fact. Season changes are audited without one. */}
              {event.reason ? ` · ${event.reason}` : ""}
            </Typography>
          </Box>
        ))}
      </Section>

      <Box>
        <Button variant="contained" onClick={onBack} sx={{ minHeight: 44 }}>
          Back to roster
        </Button>
      </Box>
    </Stack>
  );
}

const STATUS_COLOUR: Readonly<
  Record<string, "default" | "info" | "success" | "warning" | "error">
> = Object.freeze({
  Active: "success",
  Onboarding: "info",
  Inactive: "warning",
  Departed: "default",
  Archived: "default",
});

function Summary({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      {/* `div`, not `p`: some of these figures are a Chip, and a Chip is a
          `div`. Nesting one inside a paragraph is invalid HTML and React
          reports it as a hydration error rather than just rendering it. */}
      <Typography variant="h6" component="div" sx={{ fontWeight: 700, lineHeight: 1.4 }}>
        {children}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}

/**
 * One banded section, using the board's own band colours so the two surfaces
 * read as one product.
 */
function Section({
  band,
  title,
  action,
  caption,
  children,
}: {
  band: "person" | "onboarding" | "season";
  title: string;
  action?: string;
  caption?: string;
  children: React.ReactNode;
}) {
  const colours = bandOf(band);
  return (
    <Paper variant="outlined" sx={{ overflow: "hidden" }}>
      <Stack
        direction="row"
        sx={{
          bgcolor: colours.header,
          color: "common.white",
          px: 2,
          py: 0.75,
          justifyContent: "space-between",
          alignItems: "center",
          gap: 2,
        }}
      >
        <Typography variant="overline" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        {action ? (
          <Typography
            variant="overline"
            sx={{ fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}
          >
            {action}
          </Typography>
        ) : null}
      </Stack>
      <Box sx={{ bgcolor: colours.tint, px: 2, py: 1 }}>
        {caption ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", pb: 0.5 }}>
            {caption}
          </Typography>
        ) : null}
        {children}
      </Box>
    </Paper>
  );
}

/** One label/value row, editable in place where the field allows it. */
function Field({
  label,
  value,
  note,
  chip,
  onRecord,
  readOnly,
  options,
  optionLabels,
  multiple,
  selected,
  editing,
  onOpen,
  onClose,
  onCommit,
}: {
  label: string;
  value: string | null;
  note?: string;
  chip?: "default" | "info" | "success" | "warning" | "error";
  /** A durable person fact: renders, and routes to the person record. */
  onRecord?: boolean;
  readOnly?: boolean;
  options?: readonly string[];
  optionLabels?: Readonly<Record<string, string>>;
  multiple?: boolean;
  selected?: readonly string[];
  editing?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
  onCommit?: (next: string | string[]) => void;
}) {
  const shown = value === null || value === "" ? null : value;
  const editable = !onRecord && !readOnly && options !== undefined;

  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={{ xs: 0.25, sm: 2 }}
      sx={{
        py: 1,
        borderBottom: 1,
        borderColor: "divider",
        alignItems: { sm: "baseline" },
        "&:last-of-type": { borderBottom: "none" },
      }}
    >
      <Box sx={{ minWidth: { sm: 210 }, flexShrink: 0 }}>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
      </Box>

      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        {editing && options ? (
          <Select
            size="small"
            open
            autoFocus
            multiple={multiple}
            value={multiple ? [...(selected ?? [])] : (shown ?? "")}
            onClose={onClose}
            onChange={(event) => onCommit?.(event.target.value as string | string[])}
            renderValue={(picked) => (Array.isArray(picked) ? picked.join(", ") : String(picked))}
            sx={{ minWidth: 260 }}
            MenuProps={{ slotProps: { paper: { sx: { maxHeight: 360 } } } }}
          >
            {!multiple ? (
              <MenuItem value="">
                <em>Not recorded</em>
              </MenuItem>
            ) : null}
            {options.map((option) => (
              <MenuItem key={option} value={option}>
                {multiple ? (
                  <>
                    {/* The same tick the board shows. A multi-value control that
                        looked single-value on one surface and multi on the other
                        would teach two different things about one field. */}
                    <Checkbox
                      size="small"
                      sx={{ p: 0, mr: 1 }}
                      checked={(selected ?? []).includes(option)}
                    />
                    <ListItemText
                      primary={option}
                      secondary={optionLabels?.[option]}
                      slotProps={{
                        primary: { sx: { fontWeight: 700 } },
                        secondary: { sx: { fontSize: 12 } },
                      }}
                    />
                  </>
                ) : optionLabels?.[option] ? (
                  `${option} · ${optionLabels[option]}`
                ) : (
                  option
                )}
              </MenuItem>
            ))}
          </Select>
        ) : (
          <Box
            onClick={editable ? onOpen : undefined}
            sx={{
              display: "inline-block",
              cursor: editable ? "pointer" : "default",
              borderRadius: 0.5,
              px: editable ? 0.5 : 0,
              mx: editable ? -0.5 : 0,
              "&:hover": editable ? { bgcolor: "action.hover" } : undefined,
            }}
          >
            {shown === null ? (
              // `not recorded` is explicit, visible and never defaulted — never
              // an empty row, and never conflated with "No".
              <Typography variant="body2" sx={{ color: "text.disabled", fontStyle: "italic" }}>
                not recorded
              </Typography>
            ) : chip ? (
              <Chip size="small" color={chip} label={shown} />
            ) : (
              <Typography
                variant="body2"
                sx={{
                  // A dotted underline on a person fact means "changed
                  // elsewhere"; a solid hover on a season fact means "changed
                  // here". Two affordances, two meanings.
                  textDecoration: onRecord ? "underline dotted" : editable ? "underline" : "none",
                  textUnderlineOffset: 4,
                  textDecorationColor: onRecord ? undefined : "rgba(0,0,0,0.25)",
                }}
              >
                {shown}
              </Typography>
            )}
          </Box>
        )}
        {note ? (
          <Typography
            variant="caption"
            sx={{ display: "block", color: "text.disabled", lineHeight: 1.4 }}
          >
            {note}
          </Typography>
        ) : null}
      </Box>
    </Stack>
  );
}

/** A jersey row, using the board's picker so both surfaces enforce one rule. */
function JerseyField({
  label,
  held,
  holders,
  ownerName,
  editing,
  readOnly,
  onOpen,
  onClose,
  onCommit,
}: {
  label: string;
  held: readonly string[];
  holders: ReadonlyMap<string, string>;
  ownerName: string;
  editing?: boolean;
  readOnly?: boolean;
  onOpen: () => void;
  onClose: () => void;
  onCommit: (next: string[]) => void;
}) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={{ xs: 0.25, sm: 2 }}
      sx={{
        py: 1,
        borderBottom: 1,
        borderColor: "divider",
        alignItems: { sm: "baseline" },
      }}
    >
      <Box sx={{ minWidth: { sm: 210 }, flexShrink: 0 }}>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
      </Box>
      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        {editing ? (
          <JerseyPicker
            held={held}
            holders={holders}
            ownerName={ownerName}
            onCommit={onCommit}
            onClose={onClose}
            width={264}
          />
        ) : (
          <Box
            onClick={readOnly ? undefined : onOpen}
            sx={{
              display: "inline-block",
              cursor: readOnly ? "default" : "pointer",
              borderRadius: 0.5,
              px: 0.5,
              mx: -0.5,
              "&:hover": readOnly ? undefined : { bgcolor: "action.hover" },
            }}
          >
            {held.length === 0 ? (
              <Typography variant="body2" sx={{ color: "text.disabled", fontStyle: "italic" }}>
                not recorded
              </Typography>
            ) : (
              <Typography variant="body2" sx={{ textDecoration: "underline", textUnderlineOffset: 4 }}>
                {held.join(", ")}
              </Typography>
            )}
          </Box>
        )}
      </Box>
    </Stack>
  );
}
