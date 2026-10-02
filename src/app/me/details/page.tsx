import { redirect } from "next/navigation";
import Stack from "@mui/material/Stack";
import { PageHeader } from "@/components/page-header";
import { PublicShell } from "@/components/public-shell";
import { resolveOperatorAccess } from "@/lib/auth/operator";
import { readOperatorDetailsDue, readOperatorDetailsView } from "@/lib/services/operator-details";
import { OperatorDetailsForm } from "../../_operator-details/details-form";
import { saveMyOperatorDetails } from "./actions";

export const dynamic = "force-dynamic";

const DETAILS_HEADING = "Your details";

/**
 * `/me/details` — LAN-459. The operator details form, signed in. The `/operate`
 * layout sends an operator here while the form is due (after first sign-in,
 * until the required personal facts are complete); there is no way past it
 * but Save. Not due, it is not shown: the operator goes on to the app.
 */
export default async function MyOperatorDetailsPage() {
  const access = await resolveOperatorAccess();
  if (access.state === "no_session") redirect("/login?redirectTo=%2Fme%2Fdetails");
  if (access.state !== "active") redirect("/operate");

  const personId = access.operator.personId;
  if (!(await readOperatorDetailsDue(personId))) redirect("/operate");
  const view = await readOperatorDetailsView(personId);

  return (
    <PublicShell layout="stack" testId="my-operator-details">
      <Stack spacing={3}>
        <PageHeader title={DETAILS_HEADING} />
        <OperatorDetailsForm
          action={saveMyOperatorDetails}
          values={view.values}
          fields={view.fields}
        />
      </Stack>
    </PublicShell>
  );
}
