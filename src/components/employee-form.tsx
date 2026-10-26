"use client";

import { useActionState, useState } from "react";
import { saveEmployee } from "@/app/(app)/karyawan/actions";
import { EMPLOYEE_STATUSES } from "@/lib/categories";
import type { Company, Department, Employee } from "@/lib/types";
import { ActionMessage, SubmitButton } from "./form-status";
import { Field, Input, Select, Textarea } from "./ui";

export function EmployeeForm({ employee, companies, departments }: {
  employee?: Employee;
  companies: Company[];
  departments: Department[];
}) {
  const [state, action] = useActionState(saveEmployee, undefined);
  const [companyId, setCompanyId] = useState(employee?.company_id ?? companies[0]?.id ?? "");

  return (
    <form action={action} className="space-y-4">
      {employee && <input type="hidden" name="id" value={employee.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama">
          <Input name="name" defaultValue={employee?.name} required />
        </Field>
        <Field label="Jabatan / Posisi">
          <Input name="position" defaultValue={employee?.position ?? ""} />
        </Field>
        <Field label="Unit Bisnis">
          <Select name="company_id" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Departemen">
          <Select name="department_id" defaultValue={employee?.department_id ?? ""} key={companyId}>
            <option value="">—</option>
            {departments
              .filter((d) => d.company_id === companyId)
              .map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select name="status" defaultValue={employee?.status ?? "aktif"}>
            {Object.entries(EMPLOYEE_STATUSES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </Field>
        <Field label="Catatan" className="sm:col-span-2">
          <Textarea name="notes" defaultValue={employee?.notes ?? ""} placeholder="mis. pindah ke Futago per Agustus 2026" />
        </Field>
      </div>
      <ActionMessage state={state} />
      <SubmitButton>{employee ? "Simpan Perubahan" : "Tambah Karyawan"}</SubmitButton>
    </form>
  );
}
