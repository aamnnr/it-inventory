"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { ASSET_STATUSES, CATEGORIES, CATEGORY_KEYS, publicFields, secretFields, type AssetCategory } from "@/lib/categories";
import { encryptSecrets } from "@/lib/secrets";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

const optional = z
  .string()
  .trim()
  .transform((v) => v || null);

const assetSchema = z.object({
  id: optional,
  company_id: z.string().uuid({ message: "Pilih unit bisnis" }),
  category: z.enum(CATEGORY_KEYS as [AssetCategory, ...AssetCategory[]], { message: "Pilih kategori" }),
  name: z.string().trim().min(1, "Nama / merek wajib diisi"),
  serial_number: optional,
  hostname: optional,
  status: z.enum(Object.keys(ASSET_STATUSES) as [string, ...string[]]),
  department_id: optional,
  location_id: optional,
  shared_with: optional,
  purchase_date: optional,
  purchase_price: optional.transform((v) => (v ? Number(v.replace(/[^\d]/g, "")) || null : null)),
  last_cleaned_at: optional,
  notes: optional,
  initial_holder: optional,
});

function field(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

export async function saveAsset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = assetSchema.safeParse(Object.fromEntries(Object.keys(assetSchema.shape).map((k) => [k, field(formData, k)])));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, initial_holder, ...data } = parsed.data;

  const specs: Record<string, string> = {};
  for (const f of publicFields(data.category)) {
    const v = field(formData, `spec_${f.key}`).trim();
    if (v) specs[f.key] = v;
  }
  const secrets: Record<string, string> = {};
  for (const f of secretFields(data.category)) {
    const v = field(formData, `secret_${f.key}`).trim();
    if (v) secrets[f.key] = v;
  }

  const supabase = await createClient();
  let assetId = id;

  if (assetId) {
    const { error } = await supabase.from("assets").update({ ...data, specs }).eq("id", assetId);
    if (error) return { error: `Gagal menyimpan: ${error.message}` };
  } else {
    const { data: company } = await supabase.from("companies").select("code").eq("id", data.company_id).single();
    if (!company) return { error: "Unit bisnis tidak ditemukan" };
    // Kode berurutan; ulangi bila bentrok dengan penyimpanan lain di waktu yang sama
    for (let attempt = 0; attempt < 3 && !assetId; attempt++) {
      const { data: code } = await supabase.rpc("next_asset_code", {
        p_company_code: company.code,
        p_prefix: CATEGORIES[data.category].prefix,
      });
      const { data: row, error } = await supabase
        .from("assets")
        .insert({ ...data, code, specs, status: initial_holder ? "tersedia" : data.status })
        .select("id")
        .single();
      if (row) assetId = row.id;
      else if (error?.code !== "23505") return { error: `Gagal menyimpan: ${error?.message}` };
    }
    if (!assetId) return { error: "Gagal membuat kode aset, coba lagi" };

    if (initial_holder) {
      const { error } = await supabase.rpc("assign_asset", {
        p_asset_id: assetId,
        p_employee_id: initial_holder,
        p_department_id: null,
        p_date: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }),
        p_notes: "Serah terima saat aset ditambahkan",
      });
      if (error) return { error: `Aset tersimpan, tetapi serah terima gagal: ${error.message}` };
    }
  }

  if (secretFields(data.category).length) {
    const result = Object.keys(secrets).length
      ? await supabase.from("asset_secrets").upsert({ asset_id: assetId, ciphertext: encryptSecrets(secrets) })
      : await supabase.from("asset_secrets").delete().eq("asset_id", assetId);
    if (result.error) return { error: `Data sensitif gagal disimpan: ${result.error.message}` };
  }

  redirect(`/aset/${assetId}`);
}

export async function deleteAsset(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("assets").delete().eq("id", field(formData, "id"));
  if (error) throw new Error(`Gagal menghapus: ${error.message}`);
  redirect("/aset");
}

export async function assignAsset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const employee = field(formData, "employee_id") || null;
  const department = field(formData, "department_id") || null;
  if (!employee && !department) return { error: "Pilih karyawan atau departemen penerima" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_asset", {
    p_asset_id: field(formData, "asset_id"),
    p_employee_id: employee,
    p_department_id: department,
    p_date: field(formData, "date"),
    p_notes: field(formData, "notes").trim() || null,
  });
  if (error) return { error: error.message };
  refresh();
  return { ok: "Serah terima tercatat" };
}

export async function returnAsset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("return_asset", {
    p_asset_id: field(formData, "asset_id"),
    p_date: field(formData, "date"),
    p_new_status: field(formData, "status") || "tersedia",
    p_notes: field(formData, "notes").trim() || null,
  });
  if (error) return { error: error.message };
  refresh();
  return { ok: "Pengembalian tercatat" };
}
