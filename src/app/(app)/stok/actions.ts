"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

const optional = z
  .string()
  .trim()
  .transform((v) => v || null);

const itemSchema = z.object({
  id: optional,
  name: z.string().trim().min(1, "Nama barang wajib diisi"),
  category: z.string().trim().min(1, "Pilih kategori"),
  unit: z.string().trim().min(1).default("pcs"),
  min_stock: z.coerce.number().int().min(0, "Stok minimum tidak boleh minus"),
  location: optional,
  printer: optional,
  ink_code: optional,
  notes: optional,
  active: z.string().transform((v) => v !== "false"),
});

function field(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

/** Pesan error Postgres yang ramah untuk pengguna */
function friendly(message: string) {
  if (/duplicate key.*stock_items_name_key/.test(message)) return "Nama barang sudah ada";
  return message;
}

export async function saveItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = itemSchema.safeParse({
    ...Object.fromEntries(Object.keys(itemSchema.shape).map((k) => [k, field(formData, k)])),
    active: formData.get("active") === null && formData.get("id") ? "false" : "true",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...data } = parsed.data;
  const initialStock = Number(field(formData, "initial_stock") || 0);

  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("stock_items").update(data).eq("id", id);
    if (error) return { error: friendly(error.message) };
    refresh();
    return { ok: "Data barang tersimpan" };
  }

  let itemId: string | undefined;
  for (let attempt = 0; attempt < 3 && !itemId; attempt++) {
    const { data: code } = await supabase.rpc("next_item_code");
    const { data: row, error } = await supabase.from("stock_items").insert({ ...data, code }).select("id").single();
    if (row) itemId = row.id;
    else if (!/stock_items_code_key/.test(error?.message ?? "")) return { error: friendly(error?.message ?? "Gagal menyimpan") };
  }
  if (!itemId) return { error: "Gagal membuat kode barang, coba lagi" };

  if (initialStock > 0) {
    const { error } = await supabase.from("stock_movements").insert({
      item_id: itemId,
      type: "penyesuaian",
      quantity: Math.round(initialStock),
      notes: "Stok awal saat barang ditambahkan",
    });
    if (error) return { error: `Barang tersimpan, tetapi stok awal gagal: ${error.message}` };
  }
  redirect(`/stok/${itemId}`);
}

const movementSchema = z.object({
  item_id: z.string().uuid({ message: "Pilih barang" }),
  type: z.enum(["masuk", "keluar", "penyesuaian"]),
  quantity: z.coerce.number().int().refine((n) => n !== 0, "Jumlah tidak boleh 0"),
  moved_at: z.string().min(1, "Tanggal wajib diisi"),
  unit_price: optional.transform((v) => (v ? Number(v.replace(/[^\d]/g, "")) || null : null)),
  warranty: optional,
  recipient_employee_id: optional,
  recipient_company_id: optional,
  recipient: optional,
  asset_id: optional,
  notes: optional,
});

export async function recordMovement(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = movementSchema.safeParse(
    Object.fromEntries(Object.keys(movementSchema.shape).map((k) => [k, field(formData, k)])),
  );
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const m = parsed.data;

  if (m.type !== "penyesuaian" && m.quantity < 0) return { error: "Jumlah harus lebih dari 0" };
  if (m.type === "keluar" && !m.recipient && !m.recipient_employee_id && !m.asset_id) {
    return { error: "Isi penerima atau keperluan barang keluar" };
  }
  if (m.type === "penyesuaian" && !m.notes) return { error: "Tulis alasan penyesuaian, mis. hasil stok opname" };

  const supabase = await createClient();
  // Unit penerima mengikuti karyawan bila tidak dipilih
  let companyId = m.recipient_company_id;
  if (!companyId && m.recipient_employee_id) {
    const { data: emp } = await supabase.from("employees").select("company_id").eq("id", m.recipient_employee_id).single();
    companyId = emp?.company_id ?? null;
  }

  const { error } = await supabase.from("stock_movements").insert({
    ...m,
    quantity: m.type === "keluar" ? -m.quantity : m.quantity,
    unit_price: m.type === "masuk" ? m.unit_price : null,
    warranty: m.type === "masuk" ? m.warranty : null,
    recipient_company_id: m.type === "keluar" ? companyId : null,
  });
  if (error) {
    const stockError = error.message.match(/Stok .* tidak cukup.*/);
    return { error: stockError ? stockError[0] : error.message };
  }
  refresh();
  const label = { masuk: "Barang masuk", keluar: "Barang keluar", penyesuaian: "Penyesuaian stok" }[m.type];
  return { ok: `${label} tercatat` };
}

export async function deleteMovement(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("stock_movements").delete().eq("id", field(formData, "id"));
  if (error) {
    const stockError = error.message.match(/Stok .* tidak cukup.*/);
    throw new Error(stockError ? `Transaksi tidak bisa dihapus: ${stockError[0]}` : error.message);
  }
  refresh();
}
