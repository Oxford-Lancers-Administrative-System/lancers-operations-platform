// The recruit record's public surface — `/operate/recruitment/[prospectId]`,
// LAN-204. See `read.ts`, `notes.ts`, `status.ts`, `flip.ts`, `send.ts`.

export type {
  RecruitmentProspectNote,
  RecruitmentProspectRecord,
  RecruitmentQuestionnaireAnswers,
} from "./read";
export { readRecruitmentProspect, readRecruitmentProspectIn } from "./read";
export { addRecruitmentProspectNote, addRecruitmentProspectNoteIn } from "./notes";

export { updateRecruitmentProspectStatus, updateRecruitmentProspectStatusIn } from "./status";

export {
  RECRUIT_LINK_SUPERSEDED_BY_FLIP_REASON,
  flipRecruitmentProspectToJoined,
  flipRecruitmentProspectToJoinedIn,
} from "./flip";
export type { RecruitmentQuestionnaireTrack } from "./send";
export { sendRecruitmentQuestionnaire, sendRecruitmentQuestionnaireIn } from "./send";
