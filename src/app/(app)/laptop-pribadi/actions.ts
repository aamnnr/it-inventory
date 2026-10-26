"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

const str = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim() || null;

export async function saveDevice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = str(formData, "id");
  const employee_id = str(formData, "employee_id");
  const data = { device: str(formData, "device"), notes: str(formData, "notes") };
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("personal_devices").update(data).eq("id", id);
    if (error) return { error: error.message };
    refresh();
    return { ok: "Data laptop tersimpan" };
  }
  if (!employee_id) return { error: "Pilih pemilik laptop" };
  const { data: row, error } = await supabase.from("personal_devices").insert({ ...data, employee_id }).select("id").single();
  if (error) return { error: error.message };
  redirect(`/laptop-pribadi/${row.id}`);
}

export async function addRepair(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const item = str(formData, "item");
  if (!item) return { error: "Isi barang / pekerjaan perbaikan" };
  const cost = str(formData, "cost")?.replace(/[^\d]/g, "");
  const supabase = await createClient();
  const { error } = await supabase.from("personal_repairs").insert({
    device_id: str(formData, "device_id"),
    repaired_at: str(formData, "repaired_at"),
    session: str(formData, "session"),
    item,
    cost: cost ? Number(cost) : null,
    notes: str(formData, "notes"),
  });
  if (error) return { error: error.message };
  refresh();
  return { ok: "Perbaikan tercatat" };
}

export async function deleteRepair(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("personal_repairs").delete().eq("id", String(formData.get("id")));
  if (error) throw new Error(error.message);
  refresh();
}
