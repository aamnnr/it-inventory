import type { Metadata } from "next";
import { X } from "lucide-react";
import { ConfirmButton } from "@/components/confirm-button";
import { AddCompanyForm, AddMasterItemForm } from "@/components/master-forms";
import { Card, PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { getLookups } from "@/lib/data";
import type { Company } from "@/lib/types";
import { deleteMasterItem } from "./actions";

export const metadata: Metadata = { title: "Data Induk" };
export const instant = false; // data selalu segar, lihat (app)/layout.tsx

export default async function MasterPage() {
  const user = await getCurrentUser();
  const isAdmin = user.role === "admin";
  const { companies, departments, locations } = await getLookups();

  return (
    <>
      <PageHeader title="Data Induk" subtitle="Unit bisnis, departemen, dan lokasi yang dipakai di seluruh aplikasi." />
      <div className="space-y-5">
        <Card title="Unit Bisnis Kembar Futa Group">
          <ul className="mb-4 flex flex-wrap gap-2">
            {companies.map((c) => (
              <li key={c.id} className="rounded-lg border border-border px-3 py-1.5 text-sm">
                <span className="font-mono text-xs text-muted">{c.code}</span> {c.name}
              </li>
            ))}
          </ul>
          {isAdmin && <AddCompanyForm />}
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Departemen">
            {isAdmin && (
              <div className="mb-4">
                <AddMasterItemForm table="departments" companies={companies} placeholder="Nama departemen" />
              </div>
            )}
            <GroupedList table="departments" companies={companies} items={departments} canDelete={isAdmin} />
          </Card>
          <Card title="Lokasi">
            {isAdmin && (
              <div className="mb-4">
                <AddMasterItemForm table="locations" companies={companies} placeholder="mis. Lantai 2, Ruang Packing" />
              </div>
            )}
            <GroupedList table="locations" companies={companies} items={locations} canDelete={isAdmin} />
          </Card>
        </div>
      </div>
    </>
  );
}

function GroupedList({ table, companies, items, canDelete }: {
  table: "departments" | "locations";
  companies: Company[];
  items: { id: string; company_id: string; name: string }[];
  canDelete: boolean;
}) {
  return (
    <div className="space-y-4">
      {companies.map((c) => {
        const mine = items.filter((i) => i.company_id === c.id);
        if (!mine.length) return null;
        return (
          <div key={c.id}>
            <p className="mb-1.5 text-xs font-medium text-muted">{c.name}</p>
            <ul className="flex flex-wrap gap-1.5">
              {mine.map((i) => (
                <li key={i.id} className="flex items-center gap-1 rounded-md bg-subtle py-1 pl-2.5 pr-1 text-sm ring-1 ring-border">
                  {i.name}
                  {canDelete && (
                    <form action={deleteMasterItem}>
                      <input type="hidden" name="table" value={table} />
                      <input type="hidden" name="id" value={i.id} />
                      <ConfirmButton
                        variant="ghost"
                        className="h-5 px-1"
                        message={`Hapus "${i.name}"? Aset/karyawan yang memakainya akan dikosongkan kolomnya.`}
                        title="Hapus"
                      >
                        <X className="size-3" />
                      </ConfirmButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
