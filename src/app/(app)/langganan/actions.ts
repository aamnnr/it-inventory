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
const money = optional.transform((v) => (v ? Number(v.replace(/[^\d]/g, "")) || null : null));

const subscriptionSchema = z.object({
  id: optional,
  name: z.string().trim().min(1, "Nama langganan wajib diisi"),
  kind: z.enum(["internet", "lisensi", "domain_hosting", "lainnya"]),
  company_id: optional,
  vendor: optional,
  account_number: optional,
  billing_cycle: z.enum(["bulanan", "tahunan", "sekali"]),
  amount: money,
  start_date: optional,
  next_due_date: optional,
  contact: optional,
  email: optional,
  description: optional,
  notes: optional,
});

export async function saveSubscription(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = subscriptionSchema.safeParse(
    Object.fromEntries(Object.keys(subscriptionSchema.shape).map((k) => [k, String(formData.get(k) ?? "")])),
  );
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...data } = parsed.data;
  if (data.billing_cycle !== "sekali" && !data.next_due_date) return { error: "Isi tanggal jatuh tempo berikutnya" };
  const active = formData.get("active") !== null || !id;

  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("subscriptions").update({ ...data, active }).eq("id", id);
    if (error) return { error: error.message };
    refresh();
    return { ok: "Langganan tersimpan" };
  }
  const { data: row, error } = await supabase.from("subscriptions").insert(data).select("id").single();
  if (error) return { error: error.message };
  revalidatePath("/", "layout"); // kosongkan cache browser agar daftar & detail langsung terbarui
  redirect(`/langganan/${row.id}`);
}

export async function paySubscription(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const amount = String(formData.get("amount") ?? "").replace(/[^\d]/g, "");
  const supabase = await createClient();
  const { data: next, error } = await supabase.rpc("pay_subscription", {
    p_subscription_id: String(formData.get("subscription_id")),
    p_paid_at: String(formData.get("paid_at")),
    p_amount: amount ? Number(amount) : null,
    p_notes: String(formData.get("notes") ?? "").trim() || null,
  });
  if (error) return { error: error.message };
  refresh();
  return {
    ok: next
      ? `Pembayaran tercatat. Jatuh tempo berikutnya ${new Date(`${next}T12:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`
      : "Pembayaran tercatat",
  };
}

export async function deletePayment(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("subscription_payments").delete().eq("id", String(formData.get("id")));
  if (error) throw new Error(error.message);
  refresh();
}
