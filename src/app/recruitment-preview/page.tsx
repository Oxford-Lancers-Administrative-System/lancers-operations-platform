import type { Metadata } from "next";
import RecruitmentPreview from "./preview";

/**
 * `/recruitment-preview` — LAN-200's runnable fidelity mockup of recruitment
 * and the recruit's event flow.
 *
 * ## Why this route is outside `/operate`
 *
 * `/operate` is protected in `src/proxy.ts` and its layout resolves a real
 * operator against a real session before it renders anything. A mockup that
 * needed a login and a Supabase lease is a mockup nobody opens — and the
 * mission's own packages hold the leases.
 *
 * The consequence is stated plainly rather than buried: **this page has no
 * authorization and must never carry a real record.** Everything it renders
 * comes from `fixtures.ts`, there is no Supabase client and no service call
 * anywhere under this directory, and there is nothing here for authorization to
 * protect. That is fine on a branch that is never merged, and it is the reason
 * this branch is never merged.
 *
 * See `./README.md` before building any recruitment surface against it.
 */
export const metadata: Metadata = {
  title: "Recruitment fidelity mockup — LAN-200",
  robots: { index: false, follow: false },
};

export default function RecruitmentPreviewPage() {
  return <RecruitmentPreview />;
}
