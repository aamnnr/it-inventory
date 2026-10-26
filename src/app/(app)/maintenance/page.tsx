import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, CalendarX2, ClipboardList, Plus, Wrench } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { ConfirmButton } from "@/components/confirm-button";
import { FilterBar } from "@/components/filter-bar";
import { IntervalForm } from "@/components/maintenance-forms";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Pagination, StatCard, StatGrid, Table, Td, Th } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { filterHref } from "@/lib/asset-query";
import { MAINTENANCE_TYPES, dueStatus, type MaintenanceLog, type ScheduleRow } from "@/lib/care";
import { CATEGORIES, type AssetCategory } from "@/lib/categories";
import { byId, getLookups } from "@/lib/data";
import { formatDate, formatRupiah, todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { deleteMaintenance } from "./actions";

export const metadata: Metadata = { title: "Maintenance" };
export const instant = false; // data selalu segar, lihat (app)/layout.tsx

const PAGE_SIZE = 25;

export default async function MaintenancePage({ searchParams }: PageProps<"/maintenance">) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const filters = { tab: one("tab"), unit: one("unit"), kategori: one("kategori"), status: one("status"), q: one("q"), page: one("page") };
  const tab = filters.tab === "riwayat" ? "riwayat" : "jadwal";

  const user = await getCurrentUser();
  const isAdmin = user.role === "admin";
  const supabase = await createClient();
  const today = todayISO();
  const [{ data: scheduleData }, { data: logData }, { data: intervalData }, lookups] = await Promise.all([
    supabase.from("maintenance_schedule").select("*"),
    supabase.from("maintenance_logs").select("*, asset:asset_id(code, name, category)").order("performed_at", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("maintenance_intervals").select("category, months").order("months"),
    getLookups(),
  ]);
  const schedule = (scheduleData ?? []) as ScheduleRow[];
  const logs = (logData ?? []) as (MaintenanceLog & { asset: { code: string; name: string; category: string } | null })[];
  const companies = byId(lookups.companies);
  const employees = byId(lookups.employees);
  const companyByCode = new Map(lookups.companies.map((c) => [c.code, c]));

  const withStatus = schedule.map((s) => ({ ...s, due: dueStatus(s.next_due, today, 30) }));
  const overdue = withStatus.filter((s) => s.due.days !== null && s.due.days <= 0);
  const soon = withStatus.filter((s) => s.due.days !== null && s.due.days > 0 && s.due.days <= 30);
  const never = withStatus.filter((s) => s.due.days === null);
  const thisMonth = logs.filter((l) => l.performed_at.slice(0, 7) === today.slice(0, 7));

  const q = filters.q?.toLowerCase();
  const filteredSchedule = withStatus
    .filter((s) => !filters.unit || s.company_id === companyByCode.get(filters.unit)?.id)
    .filter((s) => !filters.kategori || s.category === filters.kategori)
    .filter((s) =>
      !filters.status ||
      (filters.status === "terlambat" && s.due.days !== null && s.due.days <= 0) ||
      (filters.status === "segera" && s.due.days !== null && s.due.days > 0 && s.due.days <= 30) ||
      (filters.status === "belum" && s.due.days === null) ||
      (filters.status === "aman" && s.due.days !== null && s.due.days > 30),
    )
    .filter((s) => !q || `${s.code} ${s.name} ${employees.get(s.holder_employee_id ?? "")?.name ?? ""}`.toLowerCase().includes(q))
    // terlambat dulu, lalu yang paling dekat, yang belum pernah dicatat paling akhir
    .sort((a, b) => (a.next_due ?? "9999").localeCompare(b.next_due ?? "9999"));
  const filteredLogs = logs.filter(
    (l) => !q || `${l.asset?.code} ${l.asset?.name} ${l.description} ${l.performed_by ?? ""}`.toLowerCase().includes(q),
  );

  const page = Math.max(1, Number(filters.page) || 1);
  const list = tab === "jadwal" ? filteredSchedule : filteredLogs;
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const slice = <T,>(rows: T[]) => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const tabLink = (key: "jadwal" | "riwayat", label: string) => (
    <Link
      href={key === "jadwal" ? "/maintenance" : "/maintenance?tab=riwayat"}
      className={`border-b-2 px-1 pb-2 text-sm ${tab === key ? "border-foreground font-medium" : "border-transparent text-muted hover:text-foreground"}`}
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Maintenance"
        subtitle="Jadwal pembersihan & perawatan rutin perangkat, serta riwayat service dan perbaikan."
        actions={
          isAdmin && (
            <LinkButton href="/maintenance/catat">
              <Plus className="size-4" /> Catat Maintenance
            </LinkButton>
          )
        }
      />
      <div className="mb-5 flex gap-5 border-b border-border">
        {tabLink("jadwal", "Jadwal")}
        {tabLink("riwayat", `Riwayat (${logs.length})`)}
      </div>

      <StatGrid>
        <StatCard icon={CalendarX2} label="Terlambat / Hari Ini" value={overdue.length} href="/maintenance?status=terlambat" />
        <StatCard icon={CalendarClock} label="Dalam 30 Hari" value={soon.length} href="/maintenance?status=segera" />
        <StatCard icon={ClipboardList} label="Belum Ada Catatan" value={never.length} href="/maintenance?status=belum" />
        <StatCard icon={Wrench} label="Dikerjakan Bulan Ini" value={thisMonth.length} href="/maintenance?tab=riwayat" />
      </StatGrid>

      <Card flush>
        <FilterBar
          action="/maintenance"
          q={filters.q}
          placeholder={tab === "jadwal" ? "Cari kode, nama aset, pemegang…" : "Cari aset atau pekerjaan…"}
          selects={
            tab === "jadwal"
              ? [
                  { name: "unit", value: filters.unit, allLabel: "Semua Unit", options: lookups.companies.map((c) => ({ value: c.code, label: c.name })) },
                  {
                    name: "kategori",
                    value: filters.kategori,
                    allLabel: "Semua Kategori",
                    options: (intervalData ?? []).map((i) => ({ value: i.category, label: CATEGORIES[i.category as AssetCategory].label })),
                  },
                  {
                    name: "status",
                    value: filters.status,
                    allLabel: "Semua Status",
                    options: [
                      { value: "terlambat", label: "Terlambat / hari ini" },
                      { value: "segera", label: "Dalam 30 hari" },
                      { value: "aman", label: "Terjadwal" },
                      { value: "belum", label: "Belum ada catatan" },
                    ],
                  },
                ]
              : []
          }
          hidden={tab === "riwayat" ? { tab: "riwayat" } : undefined}
        />

        {tab === "jadwal" ? (
          filteredSchedule.length === 0 ? (
            <EmptyState>Tidak ada aset yang cocok.</EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Aset</Th>
                  <Th>Unit</Th>
                  <Th>Pemegang</Th>
                  <Th>Terakhir</Th>
                  <Th>Jatuh Tempo</Th>
                  <Th>Status</Th>
                  {isAdmin && <Th />}
                </tr>
              </thead>
              <tbody>
                {slice(filteredSchedule).map((s) => (
                  <tr key={s.asset_id} className="hover:bg-subtle/60">
                    <Td>
                      <Link href={`/aset/${s.asset_id}`} className="flex items-center gap-2.5 font-medium hover:underline">
                        <CategoryIcon category={s.category} />
                        <span className="max-w-60 truncate">{s.name}</span>
                        <span className="font-mono text-xs font-normal text-muted">{s.code}</span>
                      </Link>
                    </Td>
                    <Td className="text-muted whitespace-nowrap">{companies.get(s.company_id)?.name}</Td>
                    <Td className="text-muted">{employees.get(s.holder_employee_id ?? "")?.name ?? "-"}</Td>
                    <Td className="whitespace-nowrap text-muted">{formatDate(s.last_done)}</Td>
                    <Td className="whitespace-nowrap">{formatDate(s.next_due)}</Td>
                    <Td>
                      <Badge tone={s.due.tone}>{s.due.label}</Badge>
                    </Td>
                    {isAdmin && (
                      <Td className="text-right">
                        <Link href={`/maintenance/catat?aset=${s.asset_id}`} className="text-xs text-muted hover:text-foreground hover:underline">
                          Catat
                        </Link>
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
          )
        ) : filteredLogs.length === 0 ? (
          <EmptyState>Belum ada riwayat maintenance. Riwayat mulai tercatat setelah Anda klik &ldquo;Catat Maintenance&rdquo;.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Tanggal</Th>
                <Th>Aset</Th>
                <Th>Jenis</Th>
                <Th>Pekerjaan</Th>
                <Th className="text-right">Biaya</Th>
                <Th>Oleh</Th>
                {isAdmin && <Th />}
              </tr>
            </thead>
            <tbody>
              {slice(filteredLogs).map((l) => (
                <tr key={l.id} className="hover:bg-subtle/60">
                  <Td className="whitespace-nowrap text-muted">{formatDate(l.performed_at)}</Td>
                  <Td>
                    <Link href={`/aset/${l.asset_id}`} className="hover:underline">
                      {l.asset ? `${l.asset.code} · ${l.asset.name}` : "-"}
                    </Link>
                  </Td>
                  <Td><Badge tone="blue">{MAINTENANCE_TYPES[l.type]}</Badge></Td>
                  <Td className="text-muted">{l.description}</Td>
                  <Td className="text-right tabular-nums whitespace-nowrap">{l.cost ? formatRupiah(l.cost) : "-"}</Td>
                  <Td className="text-muted">{l.performed_by ?? "-"}</Td>
                  {isAdmin && (
                    <Td className="w-10">
                      <form action={deleteMaintenance}>
                        <input type="hidden" name="id" value={l.id} />
                        <ConfirmButton variant="ghost" className="h-7 px-2 text-xs" message="Hapus catatan maintenance ini?">
                          Hapus
                        </ConfirmButton>
                      </form>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination
          page={page}
          totalPages={totalPages}
          hrefFor={(p) => filterHref("/maintenance", filters, { page: String(p) })}
          summary={`Menampilkan ${Math.min(PAGE_SIZE, Math.max(0, list.length - (page - 1) * PAGE_SIZE))} dari ${list.length} ${tab === "jadwal" ? "aset" : "catatan"}`}
        />
      </Card>

      {isAdmin && (
        <Card title="Interval Maintenance Rutin" className="mt-5">
          <p className="mb-4 text-sm text-muted">
            Jatuh tempo = tanggal maintenance terakhir + interval. Kategori lain (HP, SIM card) tidak dijadwalkan.
          </p>
          <IntervalForm intervals={intervalData ?? []} />
        </Card>
      )}
    </>
  );
}
