import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, Boxes, Plus, Users } from "lucide-react";
import { FilterBar } from "@/components/filter-bar";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Pagination, STATUS_TONE, StatCard, StatGrid, Table, Td, Th } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { filterHref } from "@/lib/asset-query";
import { EMPLOYEE_STATUSES } from "@/lib/categories";
import { byId, getLookups, searchTerm } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { Employee } from "@/lib/types";

export const metadata: Metadata = { title: "Karyawan" };
export const instant = false; // data selalu segar, lihat (app)/layout.tsx

const PAGE_SIZE = 25;

export default async function EmployeesPage({ searchParams }: PageProps<"/karyawan">) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const filters = { unit: one("unit"), status: one("status"), q: one("q"), page: one("page") };
  const page = Math.max(1, Number(filters.page) || 1);

  const user = await getCurrentUser();
  const supabase = await createClient();
  const { companies, departments, employees } = await getLookups();
  const { data: held } = await supabase.from("assets").select("holder_employee_id").not("holder_employee_id", "is", null);

  const assetCount = new Map<string, number>();
  for (const r of held ?? []) assetCount.set(r.holder_employee_id!, (assetCount.get(r.holder_employee_id!) ?? 0) + 1);

  const companyByCode = new Map(companies.map((c) => [c.code, c]));
  const term = searchTerm(filters.q)?.slice(1, -1).toLowerCase();
  const filtered = employees.filter(
    (e: Employee) =>
      (!filters.unit || e.company_id === companyByCode.get(filters.unit)?.id) &&
      (!filters.status || e.status === filters.status) &&
      (!term || e.name.toLowerCase().includes(term) || (e.position ?? "").toLowerCase().includes(term)),
  );
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const companyMap = byId(companies);
  const deptMap = byId(departments);
  const notActiveWithAssets = employees.filter((e) => e.status !== "aktif" && assetCount.get(e.id)).length;

  return (
    <>
      <PageHeader
        title="Karyawan"
        subtitle="Pemegang aset di seluruh unit bisnis."
        actions={
          user.role === "admin" && (
            <LinkButton href="/karyawan/baru">
              <Plus className="size-4" /> Tambah Karyawan
            </LinkButton>
          )
        }
      />

      <StatGrid>
        <StatCard icon={Users} label="Karyawan Aktif" value={employees.filter((e) => e.status === "aktif").length} href="/karyawan?status=aktif" />
        <StatCard icon={Boxes} label="Memegang Aset" value={assetCount.size} />
        <StatCard icon={ArrowLeftRight} label="Pindah / Resign" value={employees.filter((e) => e.status !== "aktif").length} href="/karyawan?status=pindah" />
        <StatCard icon={Boxes} label="Eks-karyawan Pegang Aset" value={notActiveWithAssets} />
      </StatGrid>

      <Card flush>
        <FilterBar
          action="/karyawan"
          q={filters.q}
          placeholder="Cari nama atau jabatan…"
          selects={[
            { name: "unit", value: filters.unit, allLabel: "Semua Unit", options: companies.map((c) => ({ value: c.code, label: c.name })) },
            {
              name: "status",
              value: filters.status,
              allLabel: "Semua Status",
              options: Object.entries(EMPLOYEE_STATUSES).map(([value, label]) => ({ value, label })),
            },
          ]}
        />
        {rows.length === 0 ? (
          <EmptyState>Tidak ada karyawan yang cocok.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Nama</Th>
                <Th>Jabatan</Th>
                <Th>Departemen</Th>
                <Th>Unit</Th>
                <Th className="text-right">Aset Dipegang</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="hover:bg-subtle/60">
                  <Td>
                    <Link href={`/karyawan/${e.id}`} className="flex items-center gap-2.5 font-medium hover:underline">
                      <span className="flex size-6 items-center justify-center rounded-full bg-subtle text-xs ring-1 ring-border">
                        {e.name.slice(0, 1).toUpperCase()}
                      </span>
                      {e.name}
                    </Link>
                  </Td>
                  <Td className="text-muted">{e.position ?? "-"}</Td>
                  <Td className="text-muted">{e.department_id ? deptMap.get(e.department_id)?.name : "-"}</Td>
                  <Td className="text-muted whitespace-nowrap">{companyMap.get(e.company_id)?.name}</Td>
                  <Td className="text-right tabular-nums">{assetCount.get(e.id) ?? 0}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[e.status]}>{EMPLOYEE_STATUSES[e.status]}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination
          page={page}
          totalPages={Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))}
          hrefFor={(p) => filterHref("/karyawan", filters, { page: String(p) })}
          summary={`Menampilkan ${rows.length} dari ${filtered.length} karyawan`}
        />
      </Card>
    </>
  );
}
