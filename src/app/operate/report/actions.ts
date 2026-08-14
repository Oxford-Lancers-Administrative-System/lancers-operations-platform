"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import { generateWeeklyReport } from "@/lib/services/weekly-report";
import type { GenerateReportState } from "./action-state";

/**
 * The Monday report's one server action — LAN-81.
 *
 * ## Why generation is an action and preview is not
 *
 * Preview reads and writes nothing, so it is a page render with a query
 * parameter: a `GET` that changes nothing is what a link is for, and it stays
 * shareable and re-runnable. Generation writes an immutable row, so it is a
 * `POST` through a server action, which is what makes it un-replayable by a
 * refresh and gives it an actor resolved from the verified session rather than
 * from anything the browser sent.
 *
 * ## Authorization
 *
 * `leadership_report` — the four calendar roles, decided on this issue and
 * recorded in `capabilities.ts`. It is re-checked here rather than inherited
 * from the page: a server action is a POST endpoint, and anybody holding a
 * session can call it whether or not a screen ever offered it. The page's gate
 * decides what is drawn; this decides what is written, and neither depends on
 * the other having run.
 *
 * This replaces the `readLeadershipReport` stub LAN-73 left in
 * `../actions.ts`, which existed to prove the capability was enforced before
 * the behaviour existed. The behaviour exists now, so the stub's claim —
 * "authorization is in place and the action is not built yet" — had become
 * false; its authorization coverage moved to `./actions.test.ts`, against this
 * action, which is the thing that can actually write.
 */

/**
 * Generates one immutable snapshot for a reporting date and opens it.
 *
 * The service does the version allocation under an advisory lock and the
 * database refuses a duplicate regardless, so a second operator pressing this
 * at the same instant gets either their own version 3 or a readable refusal —
 * never a rewritten version 2.
 */
export async function generateReportAction(
  _previous: GenerateReportState,
  formData: FormData,
): Promise<GenerateReportState> {
  const operator = await requireCapability("leadership_report");
  const value = formData.get("reportOn");
  const reportOn = typeof value === "string" ? value : "";

  let generated;
  try {
    generated = await generateWeeklyReport(operator.personId, reportOn);
  } catch (error) {
    // A refusal is rethrown so it cannot be rendered as a form error and
    // quietly retried; everything else becomes a sentence beside the date.
    if (!isServiceError(error)) throw error;
    if (error.kind === "not_permitted") throw error;
    return { error: error.message, reportOn };
  }

  revalidatePath("/operate/report");
  redirect(`/operate/report?date=${encodeURIComponent(generated.reportOn)}`);
}
