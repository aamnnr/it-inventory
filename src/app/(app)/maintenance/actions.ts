"use server";

import { redirect } from "next/navigation";
import { refresh, revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

const optional = z
  .string()
  .trim()
  .transform((v) => v || null);

const logSchema = z.object({
  asset_id: z.string().uuid({ message: "Pilih aset" }),
  type: z.enum(["pembersihan", "service", "perbaikan", "upgrade", "pengecekan"]),
  performed_at: z.string().min(1, "Tanggal wajib diisi"),
  description: z.string().trim().min(1, "Tulis apa yang dikerjakan"),
  cost: optional.transform((v) => (v ? Number(v.replace(/[^\d]/g, "")) || null : null)),
  performed_by: optional,
  return_to: optional,
});

export async function recordMaintenance(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = logSchema.safeParse(
    Object.fromEntries(Object.keys(logSchema.shape).map((k) => [k, String(formData.get(k) ?? "")])),
  );
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { return_to, ...data } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("maintenance_logs").insert(data);
  if (error) return { error: error.message };
  if (return_to?.startsWith("/")) {
    revalidatePath("/", "layout"); // kosongkan cache browser agar daftar & detail langsung terbarui
    redirect(return_to);
  }
  refresh();
  return { ok: "Maintenance tercatat" };
}

export async function deleteMaintenance(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("maintenance_logs").delete().eq("id", String(formData.get("id")));
  if (error) throw new Error(error.message);
  refresh();
}

export async function saveIntervals(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const rows: { category: string; months: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("months_")) continue;
    const months = Number(value);
    if (!Number.isInteger(months) || months < 1 || months > 60) return { error: "Interval harus 1–60 bulan" };
    rows.push({ category: key.slice(7), months });
  }
  const supabase = await createClient();
  const { error } = await supabase.from("maintenance_intervals").upsert(rows);
  if (error) return { error: error.message };
  refresh();
  return { ok: "Interval tersimpan" };
}
