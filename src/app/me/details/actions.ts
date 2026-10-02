"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { resolveOperator } from "@/lib/auth/operator";
import { saveOperatorDetails } from "@/lib/services/operator-details";
import {
  readOperatorDetailsForm,
  type OperatorDetailsFormState,
} from "@/lib/services/operator-details/fields";

/**
 * Save the signed-in operator's own details — LAN-459. The person is the
 * verified session's own, never anything the form claims. Saved, the app opens.
 */
export async function saveMyOperatorDetails(
  _previous: OperatorDetailsFormState,
  formData: FormData,
): Promise<OperatorDetailsFormState> {
  const operator = await resolveOperator();
  if (!operator) redirect("/login?redirectTo=%2Fme%2Fdetails");

  const values = readOperatorDetailsForm(formData);
  const result = await saveOperatorDetails({
    personId: operator.personId,
    actorPersonId: operator.personId,
    values,
  });
  if (!result.ok) return { values, errors: result.errors };

  revalidatePath("/", "layout");
  redirect("/operate");
}
