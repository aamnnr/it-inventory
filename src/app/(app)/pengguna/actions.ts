"use server";

import { refresh } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

export async function updateProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const id = String(formData.get("id") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  if (!fullName) return { error: "Nama wajib diisi" };
  if (id !== user.id && user.role !== "admin") return { error: "Hanya admin yang boleh mengubah pengguna lain" };

  const supabase = await createClient();
  const patch: Record<string, string> = { full_name: fullName };
  if (user.role === "admin" && (role === "admin" || role === "viewer")) patch.role = role;
  const { error } = await supabase.from("profiles").update(patch).eq("id", id);
  if (error) return { error: error.message.includes("Minimal harus ada satu admin") ? "Minimal harus ada satu admin" : error.message };
  refresh();
  return { ok: "Tersimpan" };
}
