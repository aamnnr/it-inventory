"use client";

import { useActionState, useState } from "react";
import { Lock } from "lucide-react";
import { saveAsset } from "@/app/(app)/aset/actions";
import { ASSET_STATUSES, CATEGORIES, CATEGORY_KEYS, publicFields, secretFields, type AssetCategory } from "@/lib/categories";
import type { Asset, Company, Department, Employee, Location } from "@/lib/types";
import { ActionMessage, SubmitButton } from "./form-status";
import { Card, Field, Input, LinkButton, Select, Textarea } from "./ui";

type Props = {
  asset?: Asset;
  secrets?: Record<string, string>;
  companies: Company[];
  departments: Department[];
  locations: Location[];
  employees: Employee[];
};

export function AssetForm({ asset, secrets = {}, companies, departments, locations, employees }: Props) {
  const [state, action] = useActionState(saveAsset, undefined);
  const [companyId, setCompanyId] = useState(asset?.company_id ?? companies[0]?.id ?? "");
  const [category, setCategory] = useState<AssetCategory>(asset?.category ?? "pc");

  const deptOptions = departments.filter((d) => d.company_id === companyId);
  const locOptions = locations.filter((l) => l.company_id === companyId);
  const empOptions = employees.filter((e) => e.company_id === companyId && e.status === "aktif");
  const specFields = publicFields(category);
  const secretFieldList = secretFields(category);

  return (
    <form action={action} className="space-y-5">
      {asset && <input type="hidden" name="id" value={asset.id} />}

      <Card title="Informasi Umum">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Unit Bisnis">
            <Select name="company_id" value={companyId} onChange={(e) => setCompanyId(e.target.value)} required>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Kategori" hint={asset ? "Kode aset tidak berubah meski kategori diganti" : undefined}>
            <Select name="category" value={category} onChange={(e) => setCategory(e.target.value as AssetCategory)}>
              {CATEGORY_KEYS.map((k) => (
                <option key={k} value={k}>{CATEGORIES[k].label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Nama / Merek & Tipe">
            <Input name="name" defaultValue={asset?.name} placeholder="mis. Infinix HOT 50i, PC Rakitan" required />
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue={asset?.status ?? "tersedia"}>
              {Object.entries(ASSET_STATUSES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </Field>
          <Field label="Nomor Seri">
            <Input name="serial_number" defaultValue={asset?.serial_number ?? ""} />
          </Field>
          <Field label="Hostname">
            <Input name="hostname" defaultValue={asset?.hostname ?? ""} placeholder="mis. DESKTOP-3UIKNTJ" />
          </Field>
          <Field label="Departemen">
            <Select name="department_id" defaultValue={asset?.department_id ?? ""} key={`d-${companyId}`}>
              <option value="">—</option>
              {deptOptions.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Lokasi">
            <Select name="location_id" defaultValue={asset?.location_id ?? ""} key={`l-${companyId}`}>
              <option value="">—</option>
              {locOptions.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </Select>
          </Field>
          {!asset && (
            <Field label="Langsung serahkan ke" hint="Opsional. Akan tercatat di riwayat serah terima.">
              <Select name="initial_holder" defaultValue="" key={`e-${companyId}`}>
                <option value="">— belum diserahkan —</option>
                {empOptions.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}{e.position ? ` · ${e.position}` : ""}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Dipakai bersama dengan" hint="Nama pemakai lain, pisahkan dengan koma">
            <Input name="shared_with" defaultValue={asset?.shared_with ?? ""} />
          </Field>
          <Field label="Tanggal Beli">
            <Input name="purchase_date" type="date" defaultValue={asset?.purchase_date ?? ""} />
          </Field>
          <Field label="Harga Beli (Rp)">
            <Input name="purchase_price" inputMode="numeric" defaultValue={asset?.purchase_price ?? ""} />
          </Field>
          <Field label="Terakhir Dibersihkan">
            <Input name="last_cleaned_at" type="date" defaultValue={asset?.last_cleaned_at ?? ""} />
          </Field>
          <Field label="Catatan" className="sm:col-span-2">
            <Textarea name="notes" defaultValue={asset?.notes ?? ""} />
          </Field>
        </div>
      </Card>

      {specFields.length > 0 && (
        <Card title={`Spesifikasi ${CATEGORIES[category].label}`}>
          <div className="grid gap-4 sm:grid-cols-2" key={category}>
            {specFields.map((f) => (
              <Field key={f.key} label={f.label} className={f.multiline ? "sm:col-span-2" : undefined}>
                {f.multiline ? (
                  <Textarea name={`spec_${f.key}`} defaultValue={asset?.specs?.[f.key] ?? ""} />
                ) : (
                  <Input name={`spec_${f.key}`} defaultValue={asset?.specs?.[f.key] ?? ""} />
                )}
              </Field>
            ))}
          </div>
        </Card>
      )}

      {secretFieldList.length > 0 && (
        <Card
          title={
            <span className="flex items-center gap-1.5">
              <Lock className="size-3.5" /> Data Sensitif
            </span>
          }
        >
          <p className="mb-4 text-xs text-muted">Disimpan terenkripsi dan hanya bisa dilihat admin.</p>
          <div className="grid gap-4 sm:grid-cols-2" key={`s-${category}`}>
            {secretFieldList.map((f) => (
              <Field key={f.key} label={f.label}>
                <Input name={`secret_${f.key}`} defaultValue={secrets[f.key] ?? ""} autoComplete="off" />
              </Field>
            ))}
          </div>
        </Card>
      )}

      <ActionMessage state={state} />
      <div className="flex gap-2">
        <SubmitButton>{asset ? "Simpan Perubahan" : "Tambah Aset"}</SubmitButton>
        <LinkButton variant="secondary" href={asset ? `/aset/${asset.id}` : "/aset"}>
          Batal
        </LinkButton>
      </div>
    </form>
  );
}
