import type { Metadata } from "next";
import { MovementForm } from "@/components/stock-forms";
import { Card, PageHeader } from "@/components/ui";
import { adminPage } from "@/lib/auth";
import { byId, getLookups } from "@/lib/data";
import { todayISO } from "@/lib/format";
import { MOVEMENT_TYPES, type MovementType } from "@/lib/stock";
import { getStockLevels } from "@/lib/stock-query";

export const metadata: Metadata = { title: "Catat Transaksi Stok" };
export const instant = false; // data selalu segar, lihat (app)/layout.tsx

export default async function RecordMovementPage({ searchParams }: PageProps<"/stok/catat">) {
  const sp = await searchParams;
  await adminPage("/stok");
  const jenis = typeof sp.jenis === "string" && sp.jenis in MOVEMENT_TYPES ? (sp.jenis as MovementType) : "keluar";
  const barang = typeof sp.barang === "string" ? sp.barang : undefined;
  const [levels, lookups] = await Promise.all([getStockLevels(), getLookups()]);
  const companies = byId(lookups.companies);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Catat Transaksi Stok"
        subtitle="Barang masuk (pembelian), barang keluar (dipakai / diserahkan), atau penyesuaian hasil stok opname."
      />
      <Card>
        <MovementForm
          defaultType={jenis}
          defaultItemId={barang}
          today={todayISO()}
          items={levels.filter((i) => i.active)}
          companies={lookups.companies}
          employees={lookups.employees.map((e) => ({ ...e, company_name: companies.get(e.company_id)?.name ?? "" }))}
        />
      </Card>
    </div>
  );
}
