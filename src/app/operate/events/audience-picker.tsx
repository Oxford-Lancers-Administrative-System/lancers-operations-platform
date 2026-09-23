"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { CheckField } from "@/components/field";
import { Section, type Band } from "@/components/section";
import type {
  AudienceCategorySection,
  AudienceGroupCategory,
  AudienceGroupCount,
  AudienceGroupOption,
  AudienceGroupSubCategory,
} from "@/lib/services/audience-selection";

/**
 * **Checklist bands** — the one audience picker, LAN-414 round 2.
 *
 * Brian's visual review of the pills, 2026-09-22: "I think the pills don't make
 * sense because when I click one pill that's all active, everything lights up.
 * I think it should be more: I click a group, I see how many people there are
 * and which groups I collect or not." He then chose this shape from four built
 * on `ux/audience-picker-variants`.
 *
 * The rules it is built to, in his words and Stewart's:
 *
 * - Every category is a **folding band in the roster board's band idiom**, and
 *   Coaching assignments folds again into its three sub-categories. The colours
 *   are exactly `BAND_COLOURS`, through `Section variant="banded"` — no tone is
 *   invented here.
 * - A group is a **tick-box row** carrying its head count and, right-aligned,
 *   `adds N`, **Included** or **Selected**.
 * - **No control ever changes another control's visual state.** A tick box is
 *   ticked because somebody ticked it. Overlap is only ever a number: tick
 *   All roster players and Quarterbacks does not tick itself, it
 *   says **Included**.
 * - A sticky summary reads `<n> groups · <m> people`.
 *
 * Both surfaces that choose a group render this — the event form's audience
 * step and the template editor's default audience (docs/ux/standards.md rule 7).
 * The counts are the service's (`audienceGroupCounts`); this file does no
 * arithmetic of its own.
 */

/**
 * Which roster band each part of the catalogue borrows. The catalogue is a
 * service and knows nothing about bands, so the mapping lives here, in the one
 * component that draws them.
 */
const CATEGORY_BANDS: Readonly<Record<AudienceGroupCategory, Band>> = Object.freeze({
  general: "season",
  coaching: "coaching",
  warmup: "warmup",
  special_teams: "specialTeams",
  recruits: "recruitment",
});

const SUB_CATEGORY_BANDS: Readonly<Record<AudienceGroupSubCategory, Band>> = Object.freeze({
  general: "season",
  coaching_groups: "coaching",
  offensive_positions: "offensive",
  defensive_positions: "defensive",
  warmup: "warmup",
  special_teams: "specialTeams",
  recruits: "recruitment",
});

/** "3 groups · 41 people" — the running total, in one phrasing on both surfaces. */
function describeSelectionSummary(groups: number, people: number): string {
  const groupPart = `${groups} ${groups === 1 ? "group" : "groups"}`;
  const peoplePart = `${people} ${people === 1 ? "person" : "people"}`;
  return `${groupPart} · ${peoplePart}`;
}

/**
 * What one row's numbers say. Three states and no fourth — chosen, already
 * covered by what is chosen, or a number of new people it would bring.
 */
function AddsMark({ selected, count }: { selected: boolean; count: AudienceGroupCount }) {
  if (selected) {
    return <Chip label="Selected" size="small" color="primary" data-testid="audience-adds-mark" />;
  }
  if (count.included) {
    return (
      <Chip label="Included" size="small" variant="outlined" data-testid="audience-adds-mark" />
    );
  }
  return (
    <Typography
      variant="body2"
      color="text.primary"
      sx={{ fontVariantNumeric: "tabular-nums" }}
      data-testid="audience-adds-mark"
    >
      {`adds ${count.adds}`}
    </Typography>
  );
}

const EMPTY_COUNT: AudienceGroupCount = Object.freeze({
  token: "",
  size: 0,
  adds: 0,
  included: false,
});

export interface AudiencePickerProps {
  categories: readonly AudienceCategorySection[];
  /** Per token, from `audienceGroupCounts` — one read, done by the caller. */
  counts: ReadonlyMap<string, AudienceGroupCount>;
  /** The groups that were **ticked**, never an inference from the people chosen. */
  selectedGroups: ReadonlySet<string>;
  onToggleGroup: (token: string) => void;
  /** How many people the whole selection reaches, hand-picked people included. */
  people: number;
  onClear?: () => void;
  disabled?: boolean;
}

export function AudiencePicker({
  categories,
  counts,
  selectedGroups,
  onToggleGroup,
  people,
  onClear,
  disabled = false,
}: AudiencePickerProps) {
  function countFor(token: string): AudienceGroupCount {
    return counts.get(token) ?? EMPTY_COUNT;
  }

  function chosenIn(options: readonly AudienceGroupOption[]): number {
    return options.filter((option) => selectedGroups.has(option.token)).length;
  }

  /** "2 chosen" on a band head, or nothing. A count, never a state word. */
  function chosenMark(count: number) {
    if (count === 0) return null;
    return (
      <Typography variant="body2" sx={{ color: "inherit" }}>
        {`${count} chosen`}
      </Typography>
    );
  }

  function groupRow(option: AudienceGroupOption) {
    const selected = selectedGroups.has(option.token);
    const count = countFor(option.token);
    return (
      <Box
        component="li"
        key={option.token}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          minHeight: 44,
          borderBottom: 1,
          borderColor: "divider",
          "&:last-of-type": { borderBottom: 0 },
        }}
        data-testid="audience-group-row"
        data-group={option.token}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <CheckField
            name={`audience-group-${option.token}`}
            checked={selected}
            onChange={() => onToggleGroup(option.token)}
            disabled={disabled}
            inputLabel={option.label}
            label={<Typography variant="body2">{option.label}</Typography>}
          />
        </Box>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ fontVariantNumeric: "tabular-nums", minWidth: 28, textAlign: "right" }}
          data-testid="audience-group-size"
        >
          {count.size}
        </Typography>
        <Box sx={{ minWidth: 76, display: "flex", justifyContent: "flex-end" }}>
          <AddsMark selected={selected} count={count} />
        </Box>
      </Box>
    );
  }

  function groupList(options: readonly AudienceGroupOption[]) {
    return (
      <Box sx={{ py: 0.5 }}>
        <Stack component="ul" sx={{ listStyle: "none", p: 0, m: 0 }}>
          {options.map(groupRow)}
        </Stack>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "grid", gap: 2 }} data-testid="audience-picker">
      <Paper
        variant="outlined"
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 2,
          px: { xs: 1.5, md: 2 },
          py: 1.25,
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          flexWrap: "wrap",
          bgcolor: "background.paper",
        }}
        data-testid="audience-selection-summary"
      >
        <Typography variant="h3" component="p" sx={{ fontVariantNumeric: "tabular-nums" }}>
          {describeSelectionSummary(selectedGroups.size, people)}
        </Typography>
        {onClear ? (
          <Button
            variant="text"
            size="small"
            color="error"
            onClick={onClear}
            disabled={disabled || (selectedGroups.size === 0 && people === 0)}
            sx={{ ml: "auto", minHeight: 36 }}
            data-testid="audience-clear"
          >
            Clear
          </Button>
        ) : null}
      </Paper>

      {categories.map((category) => {
        const nested = category.subSections.length > 1;
        return (
          <Section
            key={category.category}
            variant="banded"
            band={CATEGORY_BANDS[category.category]}
            collapsible
            // The two Brian's picker opens on: the baseline groups, and the
            // assignments he came to the rework for. The rest is a long tail.
            defaultOpen={category.category === "general" || category.category === "coaching"}
            title={category.label}
            testId={`audience-category-${category.category}`}
            action={chosenMark(chosenIn(category.options))}
          >
            {nested ? (
              <Stack spacing={1} sx={{ py: 1 }}>
                {category.subSections.map((subSection) => (
                  <Section
                    key={subSection.subCategory}
                    variant="banded"
                    band={SUB_CATEGORY_BANDS[subSection.subCategory]}
                    collapsible
                    defaultOpen
                    headingLevel={3}
                    title={subSection.label ?? category.label}
                    testId={`audience-subcategory-${subSection.subCategory}`}
                    action={chosenMark(chosenIn(subSection.options))}
                  >
                    {groupList(subSection.options)}
                  </Section>
                ))}
              </Stack>
            ) : (
              groupList(category.options)
            )}
          </Section>
        );
      })}
    </Box>
  );
}
