"use client";

import { useActionState } from "react";
import { paySubscription, saveSubscription } from "@/app/(app)/langganan/actions";
import { BILLING_CYCLES, SUBSCRIPTION_KINDS, type Subscription } from "@/lib/care";
import type { Company } from "@/lib/types";
import { ActionMessage, SubmitButton } from "./form-status";
import { Field, Input, Select, Textarea } from "./ui";

export function SubscriptionForm({ subscription: s, companies }: { subscription?: Subscription; companies: Company[] }) {
  const [state, action] = useActionState(saveSubscription, undefined);
  return (
    <form action={action} className="space-y-4">
      {s && <input type="hidden" name="id" value={s.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama" className="sm:col-span-2">
          <Input name="name" defaultValue={s?.name} placeholder="mis. Internet Indibiz, Lisensi AutoCAD" required />
        </Field>
        <Field label="Jenis">
          <Select name="kind" defaultValue={s?.kind ?? "internet"}>
            {Object.entries(SUBSCRIPTION_KINDS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </Field>
        <Field label="Unit Bisnis">
          <Select name="company_id" defaultValue={s?.company_id ?? ""}>
            <option value="">— grup / bersama —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Vendor / Penyedia">
          <Input name="vendor" defaultValue={s?.vendor ?? ""} />
        </Field>
        <Field label="ID / Nomor Pelanggan">
          <Input name="account_number" defaultValue={s?.account_number ?? ""} />
        </Field>
        <Field label="Siklus Tagihan">
          <Select name="billing_cycle" defaultValue={s?.billing_cycle ?? "bulanan"}>
            {Object.entries(BILLING_CYCLES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </Field>
        <Field label="Nominal (Rp)">
          <Input name="amount" inputMode="numeric" defaultValue={s?.amount ?? ""} />
        </Field>
        <Field label="Tanggal Mulai / Beli">
          <Input name="start_date" type="date" defaultValue={s?.start_date ?? ""} />
        </Field>
        <Field label="Jatuh Tempo Berikutnya" hint="Otomatis maju 1 bulan/tahun setiap dicatat bayar">
          <Input name="next_due_date" type="date" defaultValue={s?.next_due_date ?? ""} />
        </Field>
        <Field label="Kontak / Nomor Terkait">
          <Input name="contact" defaultValue={s?.contact ?? ""} />
        </Field>
        <Field label="Email Akun">
          <Input name="email" type="email" defaultValue={s?.email ?? ""} />
        </Field>
        <Field label="Benefit / Keterangan" className="sm:col-span-2">
          <Input name="description" defaultValue={s?.description ?? ""} placeholder="mis. Internet up to 300 Mbps" />
        </Field>
        <Field label="Catatan" className="sm:col-span-2">
          <Textarea name="notes" defaultValue={s?.notes ?? ""} />
        </Field>
        {s && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="active" defaultChecked={s.active} className="size-4" />
            Masih aktif (hapus centang bila langganan sudah berhenti)
          </label>
        )}
      </div>
      <ActionMessage state={state} />
      <SubmitButton>{s ? "Simpan Perubahan" : "Tambah Langganan"}</SubmitButton>
    </form>
  );
}

export function PaymentForm({ subscription: s, today }: { subscription: Subscription; today: string }) {
  const [state, action] = useActionState(paySubscription, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="subscription_id" value={s.id} />
      <Field label="Tanggal Bayar">
        <Input name="paid_at" type="date" defaultValue={today} required />
      </Field>
      <Field label="Nominal Dibayar (Rp)" hint="Kosongkan bila sama dengan nominal langganan">
        <Input name="amount" inputMode="numeric" placeholder={s.amount ? String(s.amount) : ""} />
      </Field>
      <Field label="Catatan">
        <Input name="notes" placeholder="mis. via transfer BCA, no. invoice" />
      </Field>
      <ActionMessage state={state} />
      <SubmitButton>Tandai Sudah Dibayar</SubmitButton>
    </form>
  );
}
