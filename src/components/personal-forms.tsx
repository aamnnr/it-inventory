"use client";

import { useActionState, useState } from "react";
import { addRepair, saveDevice } from "@/app/(app)/laptop-pribadi/actions";
import type { PersonalDevice } from "@/lib/care";
import type { Company, Employee } from "@/lib/types";
import { ActionMessage, SubmitButton } from "./form-status";
import { Field, Input, Select, Textarea } from "./ui";

export function DeviceForm({ device, employees, companies }: {
  device?: PersonalDevice;
  employees?: Employee[];
  companies?: Company[];
}) {
  const [state, action] = useActionState(saveDevice, undefined);
  const [companyId, setCompanyId] = useState(companies?.[0]?.id ?? "");
  return (
    <form action={action} className="space-y-4">
      {device && <input type="hidden" name="id" value={device.id} />}
      {!device && employees && companies && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Unit Bisnis">
            <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Pemilik" hint="Belum ada? Tambahkan dulu di menu Karyawan">
            <Select name="employee_id" defaultValue="" key={companyId} required>
              <option value="">— pilih karyawan —</option>
              {employees
                .filter((e) => e.company_id === companyId && e.status === "aktif")
                .map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
            </Select>
          </Field>
        </div>
      )}
      <Field label="Merek / Tipe Laptop">
        <Input name="device" defaultValue={device?.device ?? ""} placeholder="mis. ASUS Vivobook 14 A1400EA" />
      </Field>
      <Field label="Catatan">
        <Textarea name="notes" defaultValue={device?.notes ?? ""} placeholder="mis. kesepakatan biaya ditanggung kantor 50%" />
      </Field>
      <ActionMessage state={state} />
      <SubmitButton>{device ? "Simpan" : "Tambah Laptop Pribadi"}</SubmitButton>
    </form>
  );
}

export function RepairForm({ deviceId, today, nextSession }: { deviceId: string; today: string; nextSession: string }) {
  const [state, action] = useActionState(addRepair, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="device_id" value={deviceId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tanggal">
          <Input name="repaired_at" type="date" defaultValue={today} required />
        </Field>
        <Field label="Sesi" hint="Beberapa item dalam satu kali perbaikan pakai sesi yang sama">
          <Input name="session" defaultValue={nextSession} />
        </Field>
      </div>
      <Field label="Barang / Pekerjaan">
        <Input name="item" placeholder="mis. RAM DDR4 8GB 3200MHz" required />
      </Field>
      <Field label="Biaya (Rp)">
        <Input name="cost" inputMode="numeric" />
      </Field>
      <Field label="Catatan">
        <Input name="notes" />
      </Field>
      <ActionMessage state={state} />
      <SubmitButton>Catat Perbaikan</SubmitButton>
    </form>
  );
}
