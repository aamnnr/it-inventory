"use client";

import { useActionState } from "react";
import { recordMaintenance, saveIntervals } from "@/app/(app)/maintenance/actions";
import { CATEGORIES, type AssetCategory } from "@/lib/categories";
import { MAINTENANCE_TYPES } from "@/lib/care";
import { ActionMessage, SubmitButton } from "./form-status";
import { Field, Input, Select, Textarea } from "./ui";

type AssetOption = { id: string; code: string; name: string; company: string; holder?: string };

export function MaintenanceForm({ assets, defaultAssetId, today, returnTo }: {
  assets: AssetOption[];
  defaultAssetId?: string;
  today: string;
  /** halaman tujuan setelah tersimpan (mis. detail aset) */
  returnTo?: string;
}) {
  const [state, action] = useActionState(recordMaintenance, undefined);
  const companies = [...new Set(assets.map((a) => a.company))].sort();
  return (
    <form action={action} className="space-y-4">
      {returnTo && <input type="hidden" name="return_to" value={returnTo} />}
      <Field label="Aset">
        <Select name="asset_id" defaultValue={defaultAssetId ?? ""} required>
          <option value="">— pilih aset —</option>
          {companies.map((c) => (
            <optgroup key={c} label={c}>
              {assets
                .filter((a) => a.company === c)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}{a.holder ? ` · ${a.holder}` : ""}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Jenis">
          <Select name="type" defaultValue="pembersihan">
            {Object.entries(MAINTENANCE_TYPES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </Field>
        <Field label="Tanggal">
          <Input name="performed_at" type="date" defaultValue={today} required />
        </Field>
        <Field label="Yang dikerjakan" className="sm:col-span-2">
          <Textarea name="description" placeholder="mis. Bersihkan debu, ganti thermal pasta, cek kesehatan SSD 92%" required />
        </Field>
        <Field label="Biaya (Rp)" hint="Kosongkan bila tidak ada biaya">
          <Input name="cost" inputMode="numeric" />
        </Field>
        <Field label="Dikerjakan oleh">
          <Input name="performed_by" placeholder="mis. IT Support / nama vendor" />
        </Field>
      </div>
      <ActionMessage state={state} />
      <SubmitButton>Catat Maintenance</SubmitButton>
    </form>
  );
}

export function IntervalForm({ intervals }: { intervals: { category: string; months: number }[] }) {
  const [state, action] = useActionState(saveIntervals, undefined);
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {intervals.map((i) => (
          <Field key={i.category} label={CATEGORIES[i.category as AssetCategory]?.label ?? i.category}>
            <div className="flex items-center gap-1.5">
              <Input name={`months_${i.category}`} type="number" min={1} max={60} defaultValue={i.months} className="w-20" />
              <span className="text-xs text-muted">bulan</span>
            </div>
          </Field>
        ))}
      </div>
      <ActionMessage state={state} />
      <SubmitButton variant="secondary">Simpan Interval</SubmitButton>
    </form>
  );
}
