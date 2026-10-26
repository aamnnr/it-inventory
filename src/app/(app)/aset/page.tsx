import type { Metadata } from "next";
import Link from "next/link";
import { Boxes, CircleCheck, Download, Plus, TriangleAlert, Users } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { FilterBar } from "@/components/filter-bar";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Pagination, STATUS_TONE, StatCard, StatGrid, Table, Td, Th } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { filterHref, PAGE_SIZE, queryAssets, readFilters } from "@/lib/asset-query";
import { ASSET_STATUSES, CATEGORIES, CATEGORY_KEYS, categoryLabel } from "@/lib/categories";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Aset IT" };
export const instant = false; // data selalu segar, lihat (app)/layout.tsx

export default async function AssetsPage({ searchParams }: PageProps<"/aset">) {
  const filters = readFilters(await searchParams);
  const user = await getCurrentUser();
  const supabase = await createClient();

  const [{ rows, count, page }, companies, statusRows] = await Promise.all([
    queryAssets(filters),
    supabase.from("companies").select("code, name").order("name"),
    supabase.from("assets").select("status"),
  ]);

  const statusCount = (s: string) => (statusRows.data ?? []).filter((r) => r.status === s).length;
  const total = statusRows.data?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const exportHref = filterHref("/aset/export", filters, { page: undefined });

  return (
    <>
      <PageHeader
        title="Aset IT"
        subtitle="Seluruh perangkat IT di semua unit bisnis Kembar Futa Group."
        actions={
          user.role === "admin" && (
            <LinkButton href="/aset/baru">
              <Plus className="size-4" /> Tambah Aset
            </LinkButton>
          )
        }
      />

      <StatGrid>
        <StatCard icon={Boxes} label="Total Aset" value={total} href="/aset" />
        <StatCard icon={Users} label="Sedang Dipakai" value={statusCount("dipakai")} href="/aset?status=dipakai" />
        <StatCard icon={CircleCheck} label="Tersedia" value={statusCount("tersedia")} href="/aset?status=tersedia" />
        <StatCard
          icon={TriangleAlert}
          label="Rusak / Perbaikan"
          value={statusCount("rusak") + statusCount("perbaikan")}
          href="/aset?status=rusak"
        />
      </StatGrid>

      <Card flush>
        <FilterBar
          action="/aset"
          q={filters.q}
          placeholder="Cari kode, nama, hostname, pemegang…"
          selects={[
            {
              name: "unit",
              value: filters.unit,
              allLabel: "Semua Unit",
              options: (companies.data ?? []).map((c) => ({ value: c.code, label: c.name })),
            },
            {
              name: "kategori",
              value: filters.kategori,
              allLabel: "Semua Kategori",
              options: CATEGORY_KEYS.map((k) => ({ value: k, label: CATEGORIES[k].label })),
            },
            {
              name: "status",
              value: filters.status,
              allLabel: "Semua Status",
              options: Object.entries(ASSET_STATUSES).map(([value, label]) => ({ value, label })),
            },
          ]}
        >
          <LinkButton variant="secondary" href={exportHref} prefetch={false}>
            <Download className="size-4" /> Export CSV
          </LinkButton>
        </FilterBar>

        {rows.length === 0 ? (
          <EmptyState>Tidak ada aset yang cocok dengan filter.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Aset</Th>
                <Th>Kode</Th>
                <Th>Kategori</Th>
                <Th>Unit</Th>
                <Th>Pemegang</Th>
                <Th>Departemen / Lokasi</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="hover:bg-subtle/60">
                  <Td>
                    <Link href={`/aset/${a.id}`} className="flex items-center gap-2.5 font-medium hover:underline">
                      <CategoryIcon category={a.category} />
                      <span className="max-w-64 truncate">{a.name}</span>
                    </Link>
                    {(a.hostname || a.specs?.processor) && (
                      <p className="ml-7.5 mt-0.5 max-w-64 truncate text-xs text-muted">
                        {[a.hostname, a.specs?.processor].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </Td>
                  <Td className="font-mono text-xs text-muted whitespace-nowrap">{a.code}</Td>
                  <Td className="text-muted whitespace-nowrap">{categoryLabel(a.category)}</Td>
                  <Td className="text-muted whitespace-nowrap">{a.company?.name}</Td>
                  <Td className="whitespace-nowrap">
                    {a.holder ? (
                      <Link href={`/karyawan/${a.holder.id}`} className="hover:underline">{a.holder.name}</Link>
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                    {a.shared_with && <p className="text-xs text-muted">+ {a.shared_with}</p>}
                  </Td>
                  <Td className="text-muted">{a.department?.name ?? a.location?.name ?? "-"}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[a.status]}>{ASSET_STATUSES[a.status]}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination
          page={page}
          totalPages={totalPages}
          hrefFor={(p) => filterHref("/aset", filters, { page: String(p) })}
          summary={`Menampilkan ${rows.length} dari ${count} aset`}
        />
      </Card>
    </>
  );
}
