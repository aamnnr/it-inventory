import type { Metadata } from "next";
import Link from "next/link";
import { Coins, Download, PackageMinus, PackagePlus, Plus, TriangleAlert, Warehouse } from "lucide-react";
import { FilterBar } from "@/components/filter-bar";
import { StockBadge, StockIcon } from "@/components/stock-icon";
import { StockTabs } from "@/components/stock-tabs";
import { Card, EmptyState, LinkButton, PageHeader, Pagination, StatCard, StatGrid, Table, Td, Th } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { filterHref } from "@/lib/asset-query";
import { formatDate, formatRupiah } from "@/lib/format";
import { STOCK_CATEGORIES } from "@/lib/stock";
import { filterStock, getStockLevels, needsRestock, readStockFilters } from "@/lib/stock-query";

export const metadata: Metadata = { title: "Stok Barang" };
export const instant = false; // data selalu segar, lihat (app)/layout.tsx

const PAGE_SIZE = 25;

export default async function StockPage({ searchParams }: PageProps<"/stok">) {
  const filters = readStockFilters(await searchParams);
  const user = await getCurrentUser();
  const levels = await getStockLevels();

  const active = levels.filter((i) => i.active);
  const restock = active.filter(needsRestock);
  const value = active.reduce((s, i) => s + i.stock * (i.avg_price ?? 0), 0);
  const filtered = filterStock(levels, filters);
  const page = Math.max(1, Number(filters.page) || 1);
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      <PageHeader
        title="Stok Barang"
        subtitle="Barang habis pakai, sparepart, dan tinta di gudang IT Support KFG."
        actions={
          user.role === "admin" && (
            <>
              <LinkButton variant="secondary" href="/stok/catat?jenis=masuk">
                <PackagePlus className="size-4" /> Barang Masuk
              </LinkButton>
              <LinkButton variant="secondary" href="/stok/catat?jenis=keluar">
                <PackageMinus className="size-4" /> Barang Keluar
              </LinkButton>
              <LinkButton href="/stok/baru">
                <Plus className="size-4" /> Barang Baru
              </LinkButton>
            </>
          )
        }
      />
      <StockTabs active="barang" />

      <StatGrid>
        <StatCard icon={Warehouse} label="Jenis Barang" value={active.length} href="/stok" />
        <StatCard icon={PackagePlus} label="Masih Ada Stok" value={active.filter((i) => i.stock > 0).length} href="/stok?status=tersedia" />
        <StatCard icon={TriangleAlert} label="Perlu Dibeli Lagi" value={restock.length} href="/stok?status=restock" />
        <StatCard icon={Coins} label="Perkiraan Nilai Stok" value={formatRupiah(value)} />
      </StatGrid>

      <Card flush>
        <FilterBar
          action="/stok"
          q={filters.q}
          placeholder="Cari nama, kode, kode tinta…"
          selects={[
            {
              name: "kategori",
              value: filters.kategori,
              allLabel: "Semua Kategori",
              options: STOCK_CATEGORIES.map((c) => ({ value: c, label: c })),
            },
            {
              name: "status",
              value: filters.status,
              allLabel: "Semua Status",
              options: [
                { value: "tersedia", label: "Masih ada stok" },
                { value: "restock", label: "Perlu dibeli lagi" },
                { value: "habis", label: "Habis" },
                { value: "arsip", label: "Diarsipkan" },
              ],
            },
          ]}
        >
          <LinkButton variant="secondary" href={filterHref("/stok/export", filters, { page: undefined })} prefetch={false}>
            <Download className="size-4" /> Export CSV
          </LinkButton>
        </FilterBar>

        {rows.length === 0 ? (
          <EmptyState>Tidak ada barang yang cocok dengan filter.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Barang</Th>
                <Th>Kode</Th>
                <Th>Kategori</Th>
                <Th className="text-right">Stok</Th>
                <Th className="text-right">Min</Th>
                <Th className="text-right">Harga Rata-rata</Th>
                <Th>Terakhir</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} className="hover:bg-subtle/60">
                  <Td>
                    <Link href={`/stok/${i.id}`} className="flex items-center gap-2.5 font-medium hover:underline">
                      <StockIcon category={i.category} />
                      <span className="max-w-72 truncate">{i.name}</span>
                    </Link>
                    {(i.printer || i.location) && (
                      <p className="ml-7.5 mt-0.5 max-w-72 truncate text-xs text-muted">
                        {[i.printer && `Printer ${i.printer}`, i.location].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </Td>
                  <Td className="font-mono text-xs text-muted whitespace-nowrap">{i.code}</Td>
                  <Td className="text-muted whitespace-nowrap">{i.category}</Td>
                  <Td className="text-right font-medium tabular-nums whitespace-nowrap">
                    {i.stock} <span className="text-xs font-normal text-muted">{i.unit}</span>
                  </Td>
                  <Td className="text-right tabular-nums text-muted">{i.min_stock || "-"}</Td>
                  <Td className="text-right tabular-nums text-muted whitespace-nowrap">{i.avg_price ? formatRupiah(i.avg_price) : "-"}</Td>
                  <Td className="text-muted whitespace-nowrap">{formatDate(i.last_moved_at)}</Td>
                  <Td>
                    <StockBadge stock={i.stock} min={i.min_stock} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination
          page={page}
          totalPages={Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))}
          hrefFor={(p) => filterHref("/stok", filters, { page: String(p) })}
          summary={`Menampilkan ${rows.length} dari ${filtered.length} barang`}
        />
      </Card>
    </>
  );
}
