"use client";

import { useActionState, useState } from "react";
import { assignAsset, returnAsset } from "@/app/(app)/aset/actions";
import { ASSET_STATUSES } from "@/lib/categories";
import type { Department, Employee } from "@/lib/types";
import { ActionMessage, SubmitButton } from "./form-status";
import { Field, Input, Select } from "./ui";

type Props = {
  assetId: string;
  hasHolder: boolean;
  today: string;
  employees: (Employee & { company_name: string })[];
  departments: Department[];
  defaultCompanyId: string;
};

/** Form serah terima (ke karyawan / departemen) dan pengembalian aset. */
export function HandoverForm({ assetId, hasHolder, today, employees, departments, defaultCompanyId }: Props) {
  const [mode, setMode] = useState<"assign" | "return">("assign");
  const [assignState, assignAction] = useActionState(assignAsset, undefined);
  const [returnState, returnAction] = useActionState(returnAsset, undefined);
  const [companyId, setCompanyId] = useState(defaultCompanyId);
  const companies = [...new Map(employees.map((e) => [e.company_id, e.company_name])).entries()].sort((a, b) =>
    a[1].localeCompare(b[1]),
  );

  return (
    <div className="space-y-4">
      {/* Setelah pengembalian, form berganti ke serah terima; pesan suksesnya tetap ditampilkan */}
      {!hasHolder && <ActionMessage state={returnState} />}
      {hasHolder && (
        <div className="inline-flex rounded-lg bg-subtle p-1 text-sm">
          {(["assign", "return"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1 ${mode === m ? "bg-surface font-medium shadow-sm" : "text-muted"}`}
            >
              {m === "assign" ? "Pindah tangan" : "Kembalikan"}
            </button>
          ))}
        </div>
      )}

      {mode === "assign" || !hasHolder ? (
        <form action={assignAction} className="space-y-3">
          <input type="hidden" name="asset_id" value={assetId} />
          <Field label="Unit bisnis penerima">
            <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              {companies.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Diserahkan ke karyawan">
            <Select name="employee_id" defaultValue="" key={`e-${companyId}`}>
              <option value="">— pilih karyawan —</option>
              {employees
                .filter((e) => e.company_id === companyId && e.status === "aktif")
                .map((e) => (
                  <option key={e.id} value={e.id}>{e.name}{e.position ? ` · ${e.position}` : ""}</option>
                ))}
            </Select>
          </Field>
          <Field label="Atau ke departemen" hint="Untuk aset bersama, mis. printer satu tim">
            <Select name="department_id" defaultValue="" key={`d-${companyId}`}>
              <option value="">—</option>
              {departments
                .filter((d) => d.company_id === companyId)
                .map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
            </Select>
          </Field>
          <Field label="Tanggal">
            <Input type="date" name="date" defaultValue={today} required />
          </Field>
          <Field label="Catatan">
            <Input name="notes" placeholder="mis. kondisi baik, lengkap dengan charger" />
          </Field>
          <ActionMessage state={assignState} />
          <SubmitButton>Catat Serah Terima</SubmitButton>
        </form>
      ) : (
        <form action={returnAction} className="space-y-3">
          <input type="hidden" name="asset_id" value={assetId} />
          <Field label="Tanggal kembali">
            <Input type="date" name="date" defaultValue={today} required />
          </Field>
          <Field label="Status setelah kembali">
            <Select name="status" defaultValue="tersedia">
              {(["tersedia", "perbaikan", "rusak", "pensiun"] as const).map((s) => (
                <option key={s} value={s}>{ASSET_STATUSES[s]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Catatan">
            <Input name="notes" placeholder="mis. karyawan resign, layar retak" />
          </Field>
          <ActionMessage state={returnState} />
          <SubmitButton variant="secondary">Catat Pengembalian</SubmitButton>
        </form>
      )}
    </div>
  );
}
