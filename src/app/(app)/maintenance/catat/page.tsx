import type { Metadata } from "next";
import { MaintenanceForm } from "@/components/maintenance-forms";
import { Card, PageHeader } from "@/components/ui";
import { adminPage } from "@/lib/auth";
import { byId, getLookups } from "@/lib/data";
import { todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Catat Maintenance" };
export const instant = false; // data selalu segar, lihat (app)/layout.tsx

export default async function RecordMaintenancePage({ searchParams }: PageProps<"/maintenance/catat">) {
  const sp = await searchParams;
  await adminPage("/maintenance");
  const assetId = typeof sp.aset === "string" ? sp.aset : undefined;
  const supabase = await createClient();
  const [{ data: assets }, lookups] = await Promise.all([
    supabase.from("assets").select("id, code, name, company_id, holder_employee_id").neq("status", "pensiun").order("code"),
    getLookups(),
  ]);
  const companies = byId(lookups.companies);
  const employees = byId(lookups.employees);

  return (
    <div className="max-w-3xl">
      <PageHeader title="Catat Maintenance" subtitle="Pembersihan, service, perbaikan, atau upgrade perangkat." />
      <Card>
        <MaintenanceForm
          today={todayISO()}
          defaultAssetId={assetId}
          returnTo={assetId ? `/aset/${assetId}` : "/maintenance?tab=riwayat"}
          assets={(assets ?? []).map((a) => ({
            id: a.id,
            code: a.code,
            name: a.name,
            company: companies.get(a.company_id)?.name ?? "",
            holder: a.holder_employee_id ? employees.get(a.holder_employee_id)?.name : undefined,
          }))}
        />
      </Card>
    </div>
  );
}
