"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

const TABLES = { departments: "Departemen", locations: "Lokasi" } as const;
type MasterTable = keyof typeof TABLES;

function tableOf(formData: FormData): MasterTable {
  const t = String(formData.get("table"));
  if (!(t in TABLES)) throw new Error("Tabel tidak dikenal");
  return t as MasterTable;
}

export async function addCompany(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  if (!/^[A-Z0-9]{2,5}$/.test(code)) return { error: "Kode 2–5 huruf/angka, mis. FTK" };
  if (!name) return { error: "Nama unit wajib diisi" };
  const supabase = await createClient();
  const { error } = await supabase.from("companies").insert({ code, name });
  if (error) return { error: error.code === "23505" ? "Kode atau nama sudah dipakai" : error.message };
  refresh();
  return { ok: `${name} ditambahkan` };
}

export async function addMasterItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const table = tableOf(formData);
  const company_id = String(formData.get("company_id") ?? "");
  const raw = String(formData.get("name") ?? "").trim();
  const name = table === "departments" ? raw.toUpperCase() : raw;
  if (!company_id || !name) return { error: "Unit dan nama wajib diisi" };
  const supabase = await createClient();
  const { error } = await supabase.from(table).insert({ company_id, name });
  if (error) return { error: error.code === "23505" ? `${TABLES[table]} sudah ada` : error.message };
  refresh();
  return { ok: `${TABLES[table]} ${name} ditambahkan` };
}

export async function deleteMasterItem(formData: FormData) {
  await requireAdmin();
  const table = tableOf(formData);
  const supabase = await createClient();
  const { error } = await supabase.from(table).delete().eq("id", String(formData.get("id")));
  if (error) throw new Error(error.message);
  refresh();
}
