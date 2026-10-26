import type { Metadata } from "next";
import { ArrowDownToLine, ArrowUpFromLine, Coins, PackagePlus } from "lucide-react";
import { FilterBar } from "@/components/filter-bar";
import { MovementTable } from "@/components/movement-table";
import { StockTabs } from "@/components/stock-tabs";
import { Card, LinkButton, PageHeader, Pagination, StatCard, StatGrid, Table, Td } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { filterHref } from "@/lib/asset-query";
import { getLookups, searchTerm } from "@/lib/data";
import { formatRupiah } from "@/lib/format";
import { MOVEMENT_TYPES, type StockMovement } from "@/lib/stock";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Riwayat Transaksi Stok" };
export const instant = false; // data selalu segar, lihat (app)/layout.tsx

const PAGE_SIZE = 50;

export default async function MovementsPage({ searchParams }: PageProps<"/stok/transaksi">) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const filters = { jenis: one("jenis"), unit: one("unit"), bulan: one("bulan"), q: one("q"), page: one("page") };

  const user = await getCurrentUser();
  const supabase = await createClient();
  const lookups = await getLookups();
  const companyByCode = new Map(lookups.companies.map((c) => [c.code, c]));

  let query = supabase
    .from("stock_movements")
    .select("*, item:item_id(name, unit)")
    .order("moved_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (filters.jenis) query = query.eq("type", filters.jenis);
  if (filters.unit) query = query.eq("recipient_company_id", companyByCode.get(filters.unit)?.id ?? "00000000-0000-0000-0000-000000000000");
  if (filters.bulan && /^\d{4}-\d{2}$/.test(filters.bulan)) {
    const [y, m] = filters.bulan.split("-").map(Number);
    const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    query = query.gte("moved_at", `${filters.bulan}-01`).lt("moved_at", end);
  }
  const term = searchTerm(filters.q);
  if (term) {
    const { data: matchItems } = await supabase.from("stock_items").select("id").or(`name.ilike.${term},code.ilike.${term}`).limit(200);
    const conds = [`recipient.ilike.${term}`, `notes.ilike.${term}`];
    if (matchItems?.length) conds.push(`item_id.in.(${matchItems.map((i) => i.id).join(",")})`);
    query = query.or(conds.join(","));
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  type Row = StockMovement & { item: { name: string; unit: string } | null };
  const all = (data ?? []) as Row[];
  const page = Math.max(1, Number(filters.page) || 1);
  const rows = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const sumQty = (t: string) => all.filter((m) => m.type === t).reduce((s, m) => s + Math.abs(m.quantity), 0);
  const spent = all.filter((m) => m.type === "masuk").reduce((s, m) => s + (m.unit_price ?? 0) * m.quantity, 0);

  // Pemakaian (barang keluar) per unit bisnis untuk filter yang sedang aktif
  const perUnit = new Map<string, number>();
  for (const m of all.filter((m) => m.type === "keluar")) {
    const name = lookups.companies.find((c) => c.id === m.recipient_company_id)?.name ?? "Grup / tidak spesifik";
    perUnit.set(name, (perUnit.get(name) ?? 0) + Math.abs(m.quantity));
  }

  // Pilihan bulan: 12 bulan terakhir
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - i);
    return {
      value: d.toISOString().slice(0, 7),
      label: d.toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }),
    };
  });

  return (
    <>
      <PageHeader
        title="Stok Barang"
        subtitle="Barang habis pakai, sparepart, dan tinta di gudang IT Support KFG."
        actions={
          user.role === "admin" && (
            <LinkButton href="/stok/catat">
              <PackagePlus className="size-4" /> Catat Transaksi
            </LinkButton>
          )
        }
      />
      <StockTabs active="transaksi" />

      <StatGrid>
        <StatCard icon={ArrowDownToLine} label="Unit Masuk" value={sumQty("masuk")} />
        <StatCard icon={ArrowUpFromLine} label="Unit Keluar" value={sumQty("keluar")} />
        <StatCard icon={Coins} label="Total Pembelian" value={formatRupiah(spent)} />
        <StatCard icon={ArrowUpFromLine} label="Transaksi" value={all.length} />
      </StatGrid>

      <div className="grid gap-5 lg:grid-cols-4">
        <Card flush className="lg:col-span-3">
          <FilterBar
            action="/stok/transaksi"
            q={filters.q}
            placeholder="Cari barang atau penerima…"
            selects={[
              {
                name: "jenis",
                value: filters.jenis,
                allLabel: "Semua Jenis",
                options: Object.entries(MOVEMENT_TYPES).map(([value, label]) => ({ value, label })),
              },
              {
                name: "unit",
                value: filters.unit,
                allLabel: "Semua Unit",
                options: lookups.companies.map((c) => ({ value: c.code, label: c.name })),
              },
              { name: "bulan", value: filters.bulan, allLabel: "Semua Bulan", options: months },
            ]}
          />
          <MovementTable
            movements={rows}
            itemNames={new Map(all.map((m) => [m.item_id, m.item ?? { name: "(barang dihapus)", unit: "" }]))}
            employeeNames={new Map(lookups.employees.map((e) => [e.id, e.name]))}
            companyNames={new Map(lookups.companies.map((c) => [c.id, c.name]))}
            canDelete={user.role === "admin"}
          />
          <Pagination
            page={page}
            totalPages={Math.max(1, Math.ceil(all.length / PAGE_SIZE))}
            hrefFor={(p) => filterHref("/stok/transaksi", filters, { page: String(p) })}
            summary={`Menampilkan ${rows.length} dari ${all.length} transaksi`}
          />
        </Card>

        <Card title="Pemakaian per Unit" flush className="self-start">
          {perUnit.size === 0 ? (
            <p className="p-4 text-sm text-muted">Tidak ada barang keluar.</p>
          ) : (
            <Table>
              <tbody>
                {[...perUnit.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([name, qty]) => (
                    <tr key={name}>
                      <Td>{name}</Td>
                      <Td className="text-right tabular-nums">{qty}</Td>
                    </tr>
                  ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
