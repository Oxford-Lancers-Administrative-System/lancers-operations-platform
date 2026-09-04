"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { ChoiceField, DateField, Field, SelectField, TimeField } from "@/components/field";
import {
  ArrivalNotice,
  EMPTY_OUTCOME,
  Outcome,
  OutcomeSlotProvider,
  useOutcomeSlot,
} from "@/components/outcome-slot";
import { Section } from "@/components/section";

/** The two stateful stories: the fields, and the one-outcome-at-a-time slot. */
export default function KitDemos() {
  const [date, setDate] = useState("2026-09-24");
  const [time, setTime] = useState("20:00");
  const [where, setWhere] = useState("in_person");

  return (
    <>
      <Section
        title="OutcomeSlot"
        description="Press one action, then the other: a screen shows the result of at most one action (rule 1)."
      >
        <OutcomeSlotProvider>
          <Stack spacing={2}>
            <ArrivalNotice severity="success">
              The invitation has been sent. This person follows the link in it to set up their
              sign-in.
            </ArrivalNotice>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <DemoPanel
                name="resend"
                label="Resend invitation"
                notice="The invitation has been sent again."
              />
              <DemoPanel
                name="correct"
                label="Correct email and resend"
                notice="The invitation has been sent again, to the corrected address."
              />
            </Stack>
          </Stack>
        </OutcomeSlotProvider>
      </Section>

      <Section
        title="Field"
        description="One size, full width, a helper that names the format; pickers for dates and times."
      >
        <Stack spacing={3} sx={{ maxWidth: 760 }}>
          <Field label="Name" name="name" helperText="The opponent goes in the name." />
          <SelectField
            label="Type"
            name="eventType"
            value="practice"
            options={[
              { value: "practice", label: "Practice" },
              { value: "game", label: "Game" },
            ]}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Stack sx={{ flex: 1, minWidth: 0 }}>
              <DateField label="Date" name="scheduledOn" value={date} onChange={setDate} />
            </Stack>
            <Stack sx={{ flex: 1, minWidth: 0 }}>
              <TimeField label="Start" name="startsAt" value={time} onChange={setTime} />
            </Stack>
          </Stack>
          <ChoiceField
            label="Where"
            name="deliveryMode"
            value={where}
            onChange={setWhere}
            options={[
              { value: "in_person", label: "In person" },
              { value: "online", label: "Online" },
            ]}
            helperText="In person takes an address; online takes the destination."
            row
          />
          <Field
            label="Reason"
            name="reason"
            error
            helperText="Choose a reason before saving Not attending."
          />
        </Stack>
      </Section>
    </>
  );
}

function DemoPanel({ name, label, notice }: { name: string; label: string; notice: string }) {
  const slot = useOutcomeSlot(name);
  const [state, setState] = useState(EMPTY_OUTCOME);
  return (
    <Stack
      component="form"
      spacing={1}
      sx={{ flex: 1 }}
      onSubmit={(event) => {
        event.preventDefault();
        slot.claim();
        setState({ ...EMPTY_OUTCOME, notice });
      }}
    >
      <Button type="submit" variant="outlined">
        {label}
      </Button>
      <Outcome state={state} showing={slot.showing} />
    </Stack>
  );
}
