import type { Metadata } from "next";
import Link from "next/link";
import { Coins, Hammer, Laptop, Plus } from "lucide-react";
import { FilterBar } from "@/components/filter-bar";
import { Card, EmptyState, LinkButton, PageHeader, StatCard, StatGrid, Table, Td, Th } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import type { PersonalDevice, PersonalRepair } from "@/lib/care";
import { byId, getLookups } from "@/lib/data";
import { formatDate, formatRupiah, todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Laptop Pribadi" };
export const instant = false; // data selalu segar, lihat (app)/layout.tsx

export default async function PersonalDevicesPage({ searchParams }: PageProps<"/laptop-pribadi">) {
  const sp = await searchParams;
  const unit = typeof sp.unit === "string" ? sp.unit : undefined;
  const q = typeof sp.q === "string" ? sp.q.toLowerCase() : undefined;
  const user = await getCurrentUser();
  const supabase = await createClient();
  const [{ data: devices }, { data: repairs }, lookups] = await Promise.all([
    supabase.from("personal_devices").select("*"),
    supabase.from("personal_repairs").select("*"),
    getLookups(),
  ]);
  const employees = byId(lookups.employees);
  const companies = byId(lookups.companies);
  const departments = byId(lookups.departments);
  const allRepairs = ((repairs ?? []) as PersonalRepair[]).map((r) => ({ ...r, cost: r.cost === null ? null : Number(r.cost) }));
  const year = todayISO().slice(0, 4);

  const rows = ((devices ?? []) as PersonalDevice[])
    .map((d) => {
      const owner = employees.get(d.employee_id);
      const mine = allRepairs.filter((r) => r.device_id === d.id);
      return {
        ...d,
        owner,
        repairs: mine.length,
        total: mine.reduce((s, r) => s + (r.cost ?? 0), 0),
        last: mine.map((r) => r.repaired_at).sort().pop() ?? null,
      };
    })
    .filter((d) => !unit || companies.get(d.owner?.company_id ?? "")?.code === unit)
    .filter((d) => !q || `${d.owner?.name} ${d.device ?? ""}`.toLowerCase().includes(q))
    .sort((a, b) => (b.last ?? "").localeCompare(a.last ?? "") || (a.owner?.name ?? "").localeCompare(b.owner?.name ?? ""));

  const costThisYear = allRepairs.filter((r) => r.repaired_at.startsWith(year)).reduce((s, r) => s + (r.cost ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Laptop Pribadi"
        subtitle="Laptop milik karyawan yang dipakai untuk bekerja, beserta riwayat perbaikan yang dibantu IT Support."
        actions={
          user.role === "admin" && (
            <LinkButton href="/laptop-pribadi/baru">
              <Plus className="size-4" /> Tambah
            </LinkButton>
          )
        }
      />

      <StatGrid>
        <StatCard icon={Laptop} label="Laptop Terdaftar" value={devices?.length ?? 0} />
        <StatCard icon={Hammer} label="Total Perbaikan" value={allRepairs.length} />
        <StatCard icon={Coins} label={`Biaya Perbaikan ${year}`} value={formatRupiah(costThisYear)} />
        <StatCard icon={Coins} label="Biaya Seluruhnya" value={formatRupiah(allRepairs.reduce((s, r) => s + (r.cost ?? 0), 0))} />
      </StatGrid>

      <Card flush>
        <FilterBar
          action="/laptop-pribadi"
          q={typeof sp.q === "string" ? sp.q : undefined}
          placeholder="Cari nama pemilik atau laptop…"
          selects={[{ name: "unit", value: unit, allLabel: "Semua Unit", options: lookups.companies.map((c) => ({ value: c.code, label: c.name })) }]}
        />
        {rows.length === 0 ? (
          <EmptyState>Belum ada laptop pribadi yang terdaftar.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Pemilik</Th>
                <Th>Laptop</Th>
                <Th>Departemen</Th>
                <Th>Unit</Th>
                <Th className="text-right">Perbaikan</Th>
                <Th className="text-right">Total Biaya</Th>
                <Th>Terakhir</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="hover:bg-subtle/60">
                  <Td>
                    <Link href={`/laptop-pribadi/${d.id}`} className="flex items-center gap-2.5 font-medium hover:underline">
                      <span className="flex size-6 items-center justify-center rounded-full bg-subtle text-xs ring-1 ring-border">
                        {d.owner?.name.slice(0, 1).toUpperCase()}
                      </span>
                      {d.owner?.name ?? "-"}
                    </Link>
                  </Td>
                  <Td className="text-muted">{d.device ?? "-"}</Td>
                  <Td className="text-muted">{d.owner?.department_id ? departments.get(d.owner.department_id)?.name : d.owner?.position ?? "-"}</Td>
                  <Td className="text-muted whitespace-nowrap">{companies.get(d.owner?.company_id ?? "")?.name}</Td>
                  <Td className="text-right tabular-nums">{d.repairs}</Td>
                  <Td className="text-right tabular-nums whitespace-nowrap">{d.total ? formatRupiah(d.total) : "-"}</Td>
                  <Td className="whitespace-nowrap text-muted">{formatDate(d.last)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
