"use client";

import { useCallback, useMemo, useState } from "react";
import {
  INITIAL_QR,
  RECRUITS,
  type ConsentState,
  type ProspectStatus,
  type QrCode,
  type Recruit,
  type RecruitNote,
} from "./fixtures";

/**
 * One store behind every surface — LAN-200.
 *
 * This is the thing worth demonstrating and it is why the mockup switches
 * views rather than navigating: a status changed in a cell on the board is
 * changed on the recruit's record, on the event sheet, and in the audit
 * stream, because all four are reading the same rows. A real implementation
 * navigates between `/operate/recruitment` and
 * `/operate/recruitment/[prospectId]` and **should**; keeping that true across
 * a navigation needs a server, which is exactly the thing this route does not
 * have.
 *
 * Every mutation writes an audit entry, because "every commit writes an audit
 * event — actor, timestamp, field, before, after — and asks no reason" is
 * otherwise an invisible claim. The one exception is `W13`'s exits, which do
 * take a reason: recommended for `disengaged`, required for `void`.
 */

/** The operator this mockup is signed in as. Invented, like everybody else here. */
export const OPERATOR_NAME = "Caspian Hallowfield";
export const OPERATOR_ROLE = "Authorized operator";

export interface PreviewAuditEntry {
  readonly id: number;
  readonly who: string;
  readonly what: string;
  readonly detail: string | null;
}

export interface RecruitmentStore {
  readonly recruits: readonly Recruit[];
  readonly qr: QrCode;
  readonly audit: readonly PreviewAuditEntry[];
  readonly find: (id: string) => Recruit | undefined;
  readonly setStatus: (id: string, status: ProspectStatus, reason: string | null) => void;
  readonly setRecruitmentField: (
    id: string,
    key: "source" | "firstContactOn",
    value: string,
  ) => void;
  readonly addNote: (id: string, body: string) => void;
  readonly setConsent: (id: string, consent: ConsentState, on: string | null) => void;
  readonly markQuestionnaireSent: (id: string, which: "A" | "B") => void;
  readonly addRecruit: (recruit: Recruit) => void;
  readonly setAttendance: (
    id: string,
    eventId: string,
    attendance: Recruit["events"][number]["attendance"],
  ) => void;
  readonly deactivateQr: () => void;
  readonly mintQr: () => void;
  readonly reset: () => void;
}

/** The date every write in this mockup stamps. Fixed, so nothing drifts by a day. */
export const TODAY = "14 May 2026";

export function useRecruitmentStore(): RecruitmentStore {
  const [recruits, setRecruits] = useState<readonly Recruit[]>(RECRUITS);
  const [qr, setQr] = useState<QrCode>(INITIAL_QR);
  const [audit, setAudit] = useState<readonly PreviewAuditEntry[]>([]);

  /**
   * Writes one line into the audit stream.
   *
   * **Never call this from inside a `set*` updater.** The first version did,
   * and every commit appeared in the panel twice: React invokes a state
   * updater more than once in development to surface exactly this — an updater
   * that is not pure. Found by driving the flip and reading the panel, not by
   * reading the code, which is the whole reason this mockup exists.
   */
  const note = useCallback((what: string, detail: string | null) => {
    setAudit((prev) => [{ id: prev.length + 1, who: OPERATOR_NAME, what, detail }, ...prev]);
  }, []);

  /**
   * Applies one change to one recruit, and writes its audit line **outside**
   * the updater — see `note`. `change` receives the recruit as this render
   * sees them, which is also what the caller reads to build the line.
   */
  const patch = useCallback(
    (
      id: string,
      change: (recruit: Recruit) => Recruit,
      describe?: (recruit: Recruit) => { what: string; detail: string | null },
    ) => {
      const before = recruits.find((recruit) => recruit.id === id);
      if (!before) return;
      if (describe) {
        const line = describe(before);
        note(line.what, line.detail);
      }
      setRecruits((prev) => prev.map((recruit) => (recruit.id === id ? change(recruit) : recruit)));
    },
    [note, recruits],
  );

  const find = useCallback(
    (id: string) => recruits.find((recruit) => recruit.id === id),
    [recruits],
  );

  const setStatus = useCallback(
    (id: string, status: ProspectStatus, reason: string | null) => {
      patch(
        id,
        (recruit) => ({
          ...recruit,
          status,
          exitReason: reason ?? recruit.exitReason,
          // `committed_on` marks reaching **joined**, not `committed` — Brian,
          // 2026-08-31: "the day that's joined, I would say." Whether it is
          // also stamped at `committed` is explicitly unsettled and is
          // deliberately not stamped here.
          committedOn: status === "joined" ? TODAY : recruit.committedOn,
          audit: [
            {
              summary: `${recruit.status} → ${status}${reason === null ? "" : ` · ${reason}`}`,
              detail: `${TODAY} · ${OPERATOR_NAME}`,
            },
            ...recruit.audit,
          ],
        }),
        (recruit) => ({
          what: `${recruit.displayName} · ${recruit.status} → ${status}`,
          detail: reason === null ? "No reason asked" : `Reason: ${reason}`,
        }),
      );
    },
    [patch],
  );

  const setRecruitmentField = useCallback(
    (id: string, key: "source" | "firstContactOn", value: string) => {
      patch(
        id,
        (recruit) => ({
          ...recruit,
          [key]: value,
          audit: [
            { summary: `${key} changed to ${value}`, detail: `${TODAY} · ${OPERATOR_NAME}` },
            ...recruit.audit,
          ],
        }),
        (recruit) => ({
          what: `${recruit.displayName} · ${key}`,
          detail: `${recruit[key]} → ${value}`,
        }),
      );
    },
    [patch],
  );

  const addNote = useCallback(
    (id: string, body: string) => {
      const entry: RecruitNote = { body, author: OPERATOR_NAME, at: TODAY };
      patch(
        id,
        (recruit) => ({ ...recruit, notes: [entry, ...recruit.notes] }),
        (recruit) => ({ what: `${recruit.displayName} · note added`, detail: body }),
      );
    },
    [patch],
  );

  const setConsent = useCallback(
    (id: string, consent: ConsentState, on: string | null) => {
      patch(
        id,
        (recruit) => ({
          ...recruit,
          consent,
          consentOn: on,
          audit: [
            {
              summary: `Consent ${consent.replace("_", " ")}`,
              detail: `${TODAY} · ${SEASON_NOTE}`,
            },
            ...recruit.audit,
          ],
        }),
        (recruit) => ({
          what: `${recruit.displayName} · consent`,
          detail: `${recruit.consent} → ${consent}`,
        }),
      );
    },
    [patch],
  );

  const markQuestionnaireSent = useCallback(
    (id: string, which: "A" | "B") => {
      const label = which === "A" ? "Personal details" : "Recruitment";
      patch(
        id,
        (recruit) => ({
          ...recruit,
          questionnaireASentOn:
            which === "A" ? [TODAY, ...recruit.questionnaireASentOn] : recruit.questionnaireASentOn,
          questionnaireBSentOn:
            which === "B" ? [TODAY, ...recruit.questionnaireBSentOn] : recruit.questionnaireBSentOn,
          audit: [
            {
              summary: `${label} questionnaire sent · WhatsApp template`,
              detail: `${TODAY} · queued`,
            },
            ...recruit.audit,
          ],
        }),
        (recruit) => ({
          what: `${recruit.displayName} · ${label.toLowerCase()} questionnaire sent`,
          detail: "WhatsApp template",
        }),
      );
    },
    [patch],
  );

  const addRecruit = useCallback(
    (recruit: Recruit) => {
      setRecruits((prev) => [...prev, recruit]);
      note(`${recruit.displayName} · added as identified`, recruit.source);
    },
    [note],
  );

  const setAttendance = useCallback(
    (id: string, eventId: string, attendance: Recruit["events"][number]["attendance"]) => {
      patch(
        id,
        (recruit) => {
          const already = recruit.events.some((entry) => entry.eventId === eventId);
          const events = already
            ? recruit.events.map((entry) =>
                entry.eventId === eventId ? { ...entry, attendance } : entry,
              )
            : [...recruit.events, { eventId, rsvp: null, attendance }];
          // Attendance recorded moves `identified → engaged` — `W12`'s state
          // transition, and the strongest signal the platform can honestly
          // observe. Nothing else moves, and attendance *not* recorded moves
          // nothing and means nothing.
          const status: ProspectStatus =
            attendance !== null && recruit.status === "identified" ? "engaged" : recruit.status;
          return { ...recruit, events, status };
        },
        (recruit) => ({
          what: `${recruit.displayName} · attendance at ${eventId}`,
          detail: attendance === null ? "cleared" : attendance,
        }),
      );
    },
    [patch],
  );

  const deactivateQr = useCallback(() => {
    setQr((prev) => ({ ...prev, live: false, deactivatedOn: TODAY }));
    note("Sign-up QR deactivated", "Posters carrying it now land on the uniform invalid page");
  }, [note]);

  const mintQr = useCallback(() => {
    setQr((prev) => ({
      ...prev,
      id: `${prev.id}-reminted`,
      live: true,
      mintedOn: TODAY,
      mintedBy: OPERATOR_NAME,
      deactivatedOn: null,
      signIns: 0,
    }));
    note("Sign-up QR reminted", "A new code for the same season. The old one stays dead.");
  }, [note]);

  const reset = useCallback(() => {
    setRecruits(RECRUITS);
    setQr(INITIAL_QR);
    setAudit([]);
  }, []);

  return useMemo(
    () => ({
      recruits,
      qr,
      audit,
      find,
      setStatus,
      setRecruitmentField,
      addNote,
      setConsent,
      markQuestionnaireSent,
      addRecruit,
      setAttendance,
      deactivateQr,
      mintQr,
      reset,
    }),
    [
      recruits,
      qr,
      audit,
      find,
      setStatus,
      setRecruitmentField,
      addNote,
      setConsent,
      markQuestionnaireSent,
      addRecruit,
      setAttendance,
      deactivateQr,
      mintQr,
      reset,
    ],
  );
}

/** Consent is keyed to the person **and the season**, so the audit line says which. */
const SEASON_NOTE = "season 2026-27";
