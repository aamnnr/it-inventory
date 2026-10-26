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

const employeeSchema = z.object({
  id: optional,
  company_id: z.string().uuid({ message: "Pilih unit bisnis" }),
  department_id: optional,
  name: z.string().trim().min(1, "Nama wajib diisi"),
  position: optional,
  status: z.enum(["aktif", "pindah", "resign"]),
  notes: optional,
});

export async function saveEmployee(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = employeeSchema.safeParse(
    Object.fromEntries(Object.keys(employeeSchema.shape).map((k) => [k, String(formData.get(k) ?? "")])),
  );
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...data } = parsed.data;

  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("employees").update(data).eq("id", id);
    if (error) return { error: `Gagal menyimpan: ${error.message}` };
    refresh();
    return { ok: "Data karyawan tersimpan" };
  }
  const { data: row, error } = await supabase.from("employees").insert(data).select("id").single();
  if (error) return { error: `Gagal menyimpan: ${error.message}` };
  redirect(`/karyawan/${row.id}`);
}
