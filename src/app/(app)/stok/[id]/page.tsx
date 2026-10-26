import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MovementTable } from "@/components/movement-table";
import { StockBadge, StockIcon } from "@/components/stock-icon";
import { ItemForm, MovementForm } from "@/components/stock-forms";
import { ActivityList } from "@/components/activity-list";
import { Card, DefinitionList, StatCard, StatGrid } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { byId, getLookups } from "@/lib/data";
import { formatRupiah, todayISO } from "@/lib/format";
import type { StockLevel, StockMovement } from "@/lib/stock";
import { createClient } from "@/lib/supabase/server";
import { ArrowDownToLine, ArrowUpFromLine, Coins, Warehouse } from "lucide-react";

export const metadata: Metadata = { title: "Detail Barang" };
export const instant = false; // data selalu segar, lihat (app)/layout.tsx

export default async function StockItemPage({ params }: PageProps<"/stok/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  const isAdmin = user.role === "admin";
  const supabase = await createClient();
  const [{ data: level }, { data: movements }, lookups] = await Promise.all([
    supabase.from("stock_levels").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("stock_movements")
      .select("*")
      .eq("item_id", id)
      .order("moved_at", { ascending: false })
      .order("created_at", { ascending: false }),
    getLookups(),
  ]);
  if (!level) notFound();
  const item = { ...level, avg_price: level.avg_price === null ? null : Number(level.avg_price) } as StockLevel;
  const companies = byId(lookups.companies);

  return (
    <>
      <div className="mb-6 flex items-start gap-3">
        <StockIcon category={item.category} size="lg" />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{item.name}</h1>
            <StockBadge stock={item.stock} min={item.min_stock} />
            {!item.active && <span className="text-xs text-muted">(diarsipkan)</span>}
          </div>
          <p className="mt-0.5 text-sm text-muted">
            <span className="font-mono">{item.code}</span> · {item.category}
            {item.location && ` · ${item.location}`}
          </p>
        </div>
      </div>

      <StatGrid>
        <StatCard icon={Warehouse} label="Stok Sekarang" value={`${item.stock} ${item.unit}`} />
        <StatCard icon={ArrowDownToLine} label="Total Masuk" value={item.total_in} />
        <StatCard icon={ArrowUpFromLine} label="Total Keluar" value={item.total_out} />
        <StatCard icon={Coins} label="Harga Rata-rata" value={item.avg_price ? formatRupiah(item.avg_price) : "-"} />
      </StatGrid>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title={`Riwayat Transaksi (${movements?.length ?? 0})`} flush>
            <MovementTable
              movements={(movements ?? []) as StockMovement[]}
              employeeNames={new Map(lookups.employees.map((e) => [e.id, e.name]))}
              companyNames={new Map(lookups.companies.map((c) => [c.id, c.name]))}
              canDelete={isAdmin}
            />
          </Card>
          {!isAdmin && (
            <Card title="Informasi">
              <DefinitionList
                items={[
                  { label: "Stok Minimum", value: String(item.min_stock) },
                  { label: "Lokasi", value: item.location },
                  { label: "Untuk Printer", value: item.printer },
                  { label: "Kode Tinta", value: item.ink_code },
                  { label: "Catatan", value: item.notes },
                ]}
              />
            </Card>
          )}
        </div>

        {isAdmin && (
          <div className="space-y-5">
            <Card title="Catat Transaksi">
              <MovementForm
                lockItem
                defaultItemId={item.id}
                defaultType="keluar"
                today={todayISO()}
                items={[{ id: item.id, code: item.code, name: item.name, category: item.category, unit: item.unit, stock: item.stock }]}
                companies={lookups.companies}
                employees={lookups.employees.map((e) => ({ ...e, company_name: companies.get(e.company_id)?.name ?? "" }))}
              />
            </Card>
            <Card title="Edit Data Barang">
              <ItemForm item={item} />
            </Card>
            <Card title="Log Perubahan">
              <ActivityList recordIds={[item.id, ...(movements ?? []).map((m) => m.id)]} />
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
