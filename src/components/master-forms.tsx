"use client";

import { useActionState } from "react";
import { addCompany, addMasterItem } from "@/app/(app)/master/actions";
import type { Company } from "@/lib/types";
import { ActionMessage, SubmitButton } from "./form-status";
import { Input, Select } from "./ui";

export function AddCompanyForm() {
  const [state, action] = useActionState(addCompany, undefined);
  return (
    <form action={action} className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Input name="code" placeholder="Kode, mis. FTK" className="w-32 uppercase" maxLength={5} required />
        <Input name="name" placeholder="Nama unit bisnis" className="min-w-40 flex-1" required />
        <SubmitButton variant="secondary">Tambah</SubmitButton>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}

export function AddMasterItemForm({ table, companies, placeholder }: {
  table: "departments" | "locations";
  companies: Company[];
  placeholder: string;
}) {
  const [state, action] = useActionState(addMasterItem, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="table" value={table} />
      <div className="flex flex-wrap gap-2">
        <Select name="company_id" className="w-auto" required>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        <Input name="name" placeholder={placeholder} className="min-w-40 flex-1" required />
        <SubmitButton variant="secondary">Tambah</SubmitButton>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}
