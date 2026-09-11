import { Section } from "@/components/section";
import { NotRecorded } from "@/components/fact";
import { SelectField } from "@/components/field";
import { EmptyState } from "@/components/empty-state";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { PersonHistoryEntry } from "@/lib/services/people-directory";

function HistoryRow({ entry }: { entry: PersonHistoryEntry }) {
  return (
    <Box
      sx={{
        py: 1.25,
        borderBottom: 1,
        borderColor: "divider",
        "&:last-child": { borderBottom: 0 },
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {entry.summary}
      </Typography>
      {entry.fromValue !== null || entry.toValue !== null ? (
        <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
          <Typography
            component="span"
            color="text.secondary"
            sx={{ textDecoration: "line-through" }}
          >
            {entry.fromValue ?? "not recorded"}
          </Typography>{" "}
          → <Typography component="span">{entry.toValue ?? <NotRecorded />}</Typography>
        </Typography>
      ) : null}
      <Typography variant="caption" color="text.secondary" component="div">
        {entry.occurredAt.toLocaleString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}{" "}
        · {entry.actorDisplayName}
      </Typography>
      {entry.reason ? (
        <Typography variant="caption" color="text.secondary" component="div">
          Reason: {entry.reason}
        </Typography>
      ) : null}
    </Box>
  );
}

/**
 * "What changed" — a collapsed preview of the three most recent entries, or,
 * expanded (`?history=expanded`), every entry with a field/actor filter form.
 */
export default function HistorySection({
  personId,
  history,
  historyExpanded,
  historyField,
  historyActor,
}: {
  personId: string;
  history: readonly PersonHistoryEntry[];
  historyExpanded: boolean;
  historyField: string;
  historyActor: string;
}) {
  const fields = Array.from(new Set(history.map((entry) => entry.field))).sort();
  const actors = Array.from(new Set(history.map((entry) => entry.actorDisplayName))).sort();
  const filteredHistory = history.filter(
    (entry) =>
      (historyField === "" || entry.field === historyField) &&
      (historyActor === "" || entry.actorDisplayName === historyActor),
  );

  return (
    <Section
      collapsible
      defaultOpen={historyExpanded}
      title={`What changed${historyExpanded ? ` · ${filteredHistory.length} of ${history.length}` : ""}`}
      action={
        historyExpanded ? (
          <Button
            href={`/operate/people/${personId}`}
            sx={{ p: 0, minHeight: 0, textTransform: "none" }}
          >
            Collapse
          </Button>
        ) : (
          <Button
            href={`/operate/people/${personId}?history=expanded`}
            sx={{ p: 0, minHeight: 0, textTransform: "none" }}
            data-testid="history-show-all"
          >
            Show all {history.length} →
          </Button>
        )
      }
    >
      {historyExpanded ? (
        <Stack spacing={2}>
          <Box
            component="form"
            method="get"
            action={`/operate/people/${personId}`}
            data-testid="history-filters"
          >
            <input type="hidden" name="history" value="expanded" />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <SelectField
                name="field"
                label="Field"
                defaultValue={historyField}
                options={[
                  { value: "", label: "All" },
                  ...fields.map((field) => ({ value: field, label: field })),
                ]}
              />
              <SelectField
                name="actor"
                label="Changed by"
                defaultValue={historyActor}
                options={[
                  { value: "", label: "All" },
                  ...actors.map((actor) => ({ value: actor, label: actor })),
                ]}
              />
              <Button
                type="submit"
                variant="outlined"
                sx={{ minHeight: 44, alignSelf: "flex-start" }}
              >
                Apply
              </Button>
            </Stack>
          </Box>
          {filteredHistory.length === 0 ? (
            <EmptyState
              title="No changes match these filters."
              action={{
                href: `/operate/people/${personId}?history=expanded`,
                label: "Clear filters",
              }}
            />
          ) : (
            <Stack>
              {filteredHistory.map((entry) => (
                <HistoryRow key={entry.id} entry={entry} />
              ))}
            </Stack>
          )}
        </Stack>
      ) : (
        <Stack>
          {history.slice(0, 3).map((entry) => (
            <HistoryRow key={entry.id} entry={entry} />
          ))}
          {history.length === 0 ? (
            <Typography color="text.secondary">None recorded.</Typography>
          ) : null}
        </Stack>
      )}
    </Section>
  );
}
