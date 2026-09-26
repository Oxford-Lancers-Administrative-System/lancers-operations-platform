"use server";

import { revalidatePath } from "next/cache";
import { roleLabel } from "@/lib/auth/capabilities";
import {
  subjectOfRow,
  type GrantLevel,
  type GrantSubject,
  type OperatorGrants,
} from "@/lib/auth/grants";
import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import {
  copyAccessFrom,
  grantEverything,
  planCopyAccessFrom,
  planGrantEverything,
  readSeatAccess,
  setAccessGrant,
} from "@/lib/services/access-grants";
import {
  accessChangedNotice,
  accessCopiedNotice,
  accessLineRank,
  describeAccessChange,
  everythingGrantedNotice,
} from "../../presentation";

/**
 * The seat page's Access writes — LAN-430, W1. Thin adapters: each asks
 * `role_management` of the session, calls one service in
 * `src/lib/services/access-grants.ts` (which asks again, and refuses a fixed
 * seat whatever the request says), and turns the outcome into the sentence
 * the page's one Notice prints. A refusal or failure is returned, never thrown.
 */

const ACCESS_CAPABILITY = "role_management" as const;

/** A line as the page names it on the wire. Validated against the vocabulary before any service sees it. */
export interface AccessLineInput {
  readonly kind: "roster" | "recruiting" | "template" | "switch";
  readonly key: string;
}

/** What a write hands back: the seat's lines after it, or why nothing changed. */
export type AccessActionResult =
  | { readonly ok: true; readonly notice: string; readonly grants: OperatorGrants }
  | { readonly ok: false; readonly error: string };

/** What a plan hands back: every line that would change, printed, in the page's order. */
export type AccessPlanResult =
  | { readonly ok: true; readonly lines: readonly string[] }
  | { readonly ok: false; readonly error: string };

const STORED_KIND: Record<AccessLineInput["kind"], string> = {
  roster: "roster_category",
  recruiting: "recruiting_category",
  template: "event_template",
  switch: "switch",
};

function subjectOf(line: AccessLineInput): GrantSubject | null {
  if (!line || typeof line.key !== "string" || !(line.kind in STORED_KIND)) return null;
  return subjectOfRow({
    subject_kind: STORED_KIND[line.kind],
    subject_key: line.kind === "template" ? null : line.key,
    template_id: line.kind === "template" ? line.key : null,
    level: "none",
  });
}

function refresh(roleId: string): void {
  revalidatePath(`/operate/admin/roles/${roleId}`);
}

function failed(error: unknown, prefix: string): { ok: false; error: string } {
  if (!isServiceError(error)) throw error;
  return { ok: false, error: `${prefix} ${error.message}` };
}

async function templateNames(
  operator: Awaited<ReturnType<typeof requireCapability>>,
  roleId: string,
): Promise<Map<string, string>> {
  const access = await readSeatAccess(operator, roleId);
  return new Map(access.templates.map((template) => [template.id, template.name]));
}

function printed(
  changes: readonly { subject: GrantSubject; from: string; to: string }[],
  names: Map<string, string>,
): string[] {
  const nameOf = (subject: GrantSubject) =>
    subject.kind === "template" ? (names.get(subject.templateId) ?? null) : null;
  return [...changes]
    .sort((left, right) =>
      accessLineRank(left.subject, nameOf(left.subject)).localeCompare(
        accessLineRank(right.subject, nameOf(right.subject)),
      ),
    )
    .map((change) => describeAccessChange(change, nameOf(change.subject)));
}

const NOT_CHANGED = "The grant was not changed.";
const NOT_COPIED = "Access was not copied.";
const NOT_GRANTED = "Nothing was granted.";

/** Save on press: one line of one seat. */
export async function setAccessGrantAction(
  roleId: string,
  line: AccessLineInput,
  level: string,
): Promise<AccessActionResult> {
  try {
    const operator = await requireCapability(ACCESS_CAPABILITY);
    const subject = subjectOf(line);
    if (subject === null) return { ok: false, error: `${NOT_CHANGED} That line is not offered.` };

    const result = await setAccessGrant(operator, {
      roleId,
      subject,
      level: level as GrantLevel,
    });
    refresh(roleId);
    const change = result.changes[0];
    if (!change) return { ok: true, notice: "", grants: result.grants };
    const names = subject.kind === "template" ? await templateNames(operator, roleId) : new Map();
    return {
      ok: true,
      notice: accessChangedNotice(
        change,
        subject.kind === "template" ? (names.get(subject.templateId) ?? null) : null,
      ),
      grants: result.grants,
    };
  } catch (error) {
    return failed(error, NOT_CHANGED);
  }
}

/** Every line Copy access would change, for the dialog. */
export async function planCopyAccessAction(
  roleId: string,
  sourceRoleId: string,
): Promise<AccessPlanResult> {
  try {
    const operator = await requireCapability(ACCESS_CAPABILITY);
    const changes = await planCopyAccessFrom(operator, { roleId, sourceRoleId });
    return { ok: true, lines: printed(changes, await templateNames(operator, roleId)) };
  } catch (error) {
    return failed(error, NOT_COPIED);
  }
}

/** Copy access from another seat: one service call, one audit row. */
export async function copyAccessAction(
  roleId: string,
  sourceRoleId: string,
): Promise<AccessActionResult> {
  try {
    const operator = await requireCapability(ACCESS_CAPABILITY);
    const result = await copyAccessFrom(operator, { roleId, sourceRoleId });
    refresh(roleId);
    const source = await readSeatAccess(operator, sourceRoleId);
    return {
      ok: true,
      notice: accessCopiedNotice(roleLabel(source.seat.code), result.changes.length),
      grants: result.grants,
    };
  } catch (error) {
    return failed(error, NOT_COPIED);
  }
}

/** Every line Grant everything would raise, for the dialog. */
export async function planGrantEverythingAction(roleId: string): Promise<AccessPlanResult> {
  try {
    const operator = await requireCapability(ACCESS_CAPABILITY);
    const changes = await planGrantEverything(operator, { roleId });
    return { ok: true, lines: printed(changes, await templateNames(operator, roleId)) };
  } catch (error) {
    return failed(error, NOT_GRANTED);
  }
}

/** Grant everything: one service call, one audit row. */
export async function grantEverythingAction(roleId: string): Promise<AccessActionResult> {
  try {
    const operator = await requireCapability(ACCESS_CAPABILITY);
    const result = await grantEverything(operator, { roleId });
    refresh(roleId);
    return {
      ok: true,
      notice: everythingGrantedNotice(result.changes.length),
      grants: result.grants,
    };
  } catch (error) {
    return failed(error, NOT_GRANTED);
  }
}
