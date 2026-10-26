import type { Metadata } from "next";
import Link from "next/link";
import { Boxes, PackageX, Receipt, TriangleAlert, UserX, Wrench } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { StockBadge, StockIcon } from "@/components/stock-icon";
import { getStockLevels, needsRestock } from "@/lib/stock-query";
import { Badge, Card, EmptyState, PageHeader, STATUS_TONE, StatCard, StatGrid, Table, Td, Th } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { ASSET_STATUSES, CATEGORIES, CATEGORY_KEYS, EMPLOYEE_STATUSES } from "@/lib/categories";
import { byId, getLookups } from "@/lib/data";
import { formatDate, formatDateTime, formatRupiah, todayISO } from "@/lib/format";
import { dueStatus, type ScheduleRow, type Subscription } from "@/lib/care";
import { createClient } from "@/lib/supabase/server";
import type { Asset } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard" };
export const instant = false; // data selalu segar, lihat (app)/layout.tsx

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const today = todayISO();
  const [{ data }, lookups, stock, { data: subData }, { data: maintData }] = await Promise.all([
    supabase.from("assets").select("id, code, name, category, status, company_id, holder_employee_id, updated_at"),
    getLookups(),
    getStockLevels(),
    supabase.from("subscriptions").select("*").eq("active", true).not("next_due_date", "is", null).order("next_due_date"),
    supabase.from("maintenance_schedule").select("*").lte("next_due", today).order("next_due"),
  ]);
  // Pengingat: langganan jatuh tempo ≤ 14 hari / terlambat, dan maintenance yang sudah lewat
  const dueSubs = ((subData ?? []) as Subscription[])
    .map((s) => ({ ...s, due: dueStatus(s.next_due_date, today) }))
    .filter((s) => s.due.days !== null && s.due.days <= 14);
  const dueMaint = (maintData ?? []) as ScheduleRow[];
  const restock = stock.filter((i) => i.active && needsRestock(i)).sort((a, b) => a.stock - b.stock);
  const assets = (data ?? []) as Pick<Asset, "id" | "code" | "name" | "category" | "status" | "company_id" | "holder_employee_id" | "updated_at">[];
  const employees = byId(lookups.employees);

  const attention = assets.filter((a) => a.status === "rusak" || a.status === "perbaikan");
  const orphaned = assets.filter((a) => {
    const holder = a.holder_employee_id ? employees.get(a.holder_employee_id) : undefined;
    return holder && holder.status !== "aktif";
  });
  const usedCategories = CATEGORY_KEYS.filter((k) => assets.some((a) => a.category === k));
  const recent = [...assets].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 8);

  return (
    <>
      <PageHeader title={`Halo, ${user.name.split(" ")[0]}`} subtitle="Ringkasan inventaris IT seluruh unit bisnis Kembar Futa Group." />

      <StatGrid>
        <StatCard icon={Boxes} label="Total Aset" value={assets.length} href="/aset" />
        <StatCard icon={PackageX} label="Stok Perlu Dibeli" value={restock.length} href="/stok?status=restock" />
        <StatCard icon={TriangleAlert} label="Rusak / Perbaikan" value={attention.length} href="/aset?status=rusak" />
        <StatCard icon={UserX} label="Dipegang Eks-Karyawan" value={orphaned.length} href="/karyawan?status=pindah" />
      </StatGrid>

      <div className="space-y-5">
        <Card title="Jumlah Aset per Unit Bisnis" flush>
          <Table>
            <thead>
              <tr>
                <Th>Unit</Th>
                {usedCategories.map((k) => (
                  <Th key={k} className="text-right">{CATEGORIES[k].label}</Th>
                ))}
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {lookups.companies.map((c) => {
                const mine = assets.filter((a) => a.company_id === c.id);
                return (
                  <tr key={c.id} className="hover:bg-subtle/60">
                    <Td>
                      <Link href={`/aset?unit=${c.code}`} className="font-medium hover:underline">{c.name}</Link>
                    </Td>
                    {usedCategories.map((k) => {
                      const n = mine.filter((a) => a.category === k).length;
                      return (
                        <Td key={k} className="text-right tabular-nums">
                          {n ? <Link href={`/aset?unit=${c.code}&kategori=${k}`} className="hover:underline">{n}</Link> : <span className="text-muted">–</span>}
                        </Td>
                      );
                    })}
                    <Td className="text-right font-medium tabular-nums">{mine.length}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Pengingat Jatuh Tempo" flush className="lg:col-span-2">
            {dueSubs.length + dueMaint.length === 0 ? (
              <EmptyState>Tidak ada tagihan atau maintenance yang jatuh tempo dalam 2 minggu ke depan.</EmptyState>
            ) : (
              <ul className="divide-y divide-border">
                {dueSubs.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <Link href={`/langganan/${s.id}`} className="flex min-w-0 items-center gap-2.5 hover:underline">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-violet-500 text-white">
                        <Receipt className="size-3" />
                      </span>
                      <span className="truncate">Bayar {s.name}</span>
                      <span className="shrink-0 text-xs text-muted">{formatRupiah(s.amount === null ? null : Number(s.amount))}</span>
                    </Link>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-muted">{formatDate(s.next_due_date)}</span>
                      <Badge tone={s.due.tone}>{s.due.label}</Badge>
                    </span>
                  </li>
                ))}
                {dueMaint.length > 0 && (
                  <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <Link href="/maintenance?status=terlambat" className="flex min-w-0 items-center gap-2.5 hover:underline">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-orange-500 text-white">
                        <Wrench className="size-3" />
                      </span>
                      <span className="truncate">
                        Maintenance {dueMaint.length} perangkat sudah lewat jadwal
                        <span className="text-muted"> — {dueMaint.slice(0, 3).map((m) => m.code).join(", ")}{dueMaint.length > 3 ? ", …" : ""}</span>
                      </span>
                    </Link>
                    <Badge tone="red">Terlambat</Badge>
                  </li>
                )}
              </ul>
            )}
          </Card>

          <Card title="Perlu Perhatian" flush>
            {attention.length + orphaned.length === 0 ? (
              <EmptyState>Semua aman.</EmptyState>
            ) : (
              <ul className="divide-y divide-border">
                {orphaned.map((a) => {
                  const h = employees.get(a.holder_employee_id!)!;
                  return (
                    <AssetLine key={`o-${a.id}`} asset={a}>
                      <Badge tone="amber">Pemegang {EMPLOYEE_STATUSES[h.status].toLowerCase()}: {h.name}</Badge>
                    </AssetLine>
                  );
                })}
                {attention.map((a) => (
                  <AssetLine key={a.id} asset={a}>
                    <Badge tone={STATUS_TONE[a.status]}>{ASSET_STATUSES[a.status]}</Badge>
                  </AssetLine>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Stok Perlu Dibeli"
            flush
            actions={<Link href="/stok?status=restock" className="text-xs text-muted hover:text-foreground">Lihat semua</Link>}
          >
            {restock.length === 0 ? (
              <EmptyState>Semua stok di atas batas minimum.</EmptyState>
            ) : (
              <ul className="divide-y divide-border">
                {restock.slice(0, 8).map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <Link href={`/stok/${i.id}`} className="flex min-w-0 items-center gap-2.5 hover:underline">
                      <StockIcon category={i.category} />
                      <span className="truncate">{i.name}</span>
                    </Link>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-xs tabular-nums text-muted">{i.stock}/{i.min_stock}</span>
                      <StockBadge stock={i.stock} min={i.min_stock} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Aset Terakhir Diperbarui" flush className="lg:col-span-2">
            {recent.length === 0 ? (
              <EmptyState>Belum ada aset. Jalankan import atau tambah aset baru.</EmptyState>
            ) : (
              <ul className="divide-y divide-border">
                {recent.map((a) => (
                  <AssetLine key={a.id} asset={a}>
                    <span className="text-xs text-muted">{formatDateTime(a.updated_at)}</span>
                  </AssetLine>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function AssetLine({ asset, children }: { asset: Pick<Asset, "id" | "code" | "name" | "category">; children: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <Link href={`/aset/${asset.id}`} className="flex min-w-0 items-center gap-2.5 hover:underline">
        <CategoryIcon category={asset.category} />
        <span className="truncate">{asset.name}</span>
        <span className="shrink-0 font-mono text-xs text-muted">{asset.code}</span>
      </Link>
      {children}
    </li>
  );
}
