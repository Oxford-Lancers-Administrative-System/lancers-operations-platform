"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string | null };

/**
 * Email/password sign-in. This is the only auth path this ticket proves.
 * Public self-registration is disabled in supabase/config.toml, so there is
 * deliberately no sign-up action here — users are pre-provisioned.
 */
export async function signIn(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectToRaw = String(formData.get("redirectTo") ?? "/operate");

  // Only allow same-origin relative paths, so a crafted link cannot bounce a
  // freshly authenticated user off to an attacker-controlled host.
  const redirectTo =
    redirectToRaw.startsWith("/") && !redirectToRaw.startsWith("//") ? redirectToRaw : "/operate";

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
