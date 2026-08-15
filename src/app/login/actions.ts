"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { safeRelativeDestination } from "@/lib/auth/destination";

export type LoginState = { error: string | null };

/**
 * Email/password sign-in. This is the only auth path this ticket proves.
 * Public self-registration is disabled in supabase/config.toml, so there is
 * deliberately no sign-up action here — users are pre-provisioned.
 */
export async function signIn(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  // Only allow same-origin relative paths, so a crafted link cannot bounce a
  // freshly authenticated user off to an attacker-controlled host. The rule
  // itself is in `@/lib/auth/destination`, shared with the page and with both
  // recovery routes so there is one copy of it to get wrong.
  const redirectTo = safeRelativeDestination(formData.get("redirectTo"));

  if (!email || !password) {
    return { error: "Enter an email address and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Invalid email or password." };
  }

  revalidatePath("/", "layout");
  redirect(redirectTo);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
