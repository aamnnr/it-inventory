import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, Pencil, Trash } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { HandoverForm } from "@/components/handover-form";
import { ActivityList } from "@/components/activity-list";
import { ConfirmButton } from "@/components/confirm-button";
import { Badge, Card, DefinitionList, EmptyState, LinkButton, STATUS_TONE, Table, Td, Th } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { ASSET_STATUSES, categoryLabel, publicFields, secretFields } from "@/lib/categories";
import { getLookups, byId } from "@/lib/data";
import { formatDate, formatRupiah, todayISO } from "@/lib/format";
import { decryptSecrets } from "@/lib/secrets";
import { createClient } from "@/lib/supabase/server";
import type { Asset, Assignment } from "@/lib/types";
import { MAINTENANCE_TYPES, dueStatus, type MaintenanceLog } from "@/lib/care";
import { deleteAsset } from "../actions";

export const metadata: Metadata = { title: "Detail Aset" };
export const instant = false; // data selalu segar, lihat (app)/layout.tsx

export default async function AssetDetailPage({ params }: PageProps<"/aset/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  const isAdmin = user.role === "admin";
  const supabase = await createClient();

  const [{ data: asset }, { data: history }, lookups, secretRow, { data: maintenance }, { data: schedule }] = await Promise.all([
    supabase.from("assets").select("*").eq("id", id).maybeSingle(),
    supabase.from("asset_assignments").select("*").eq("asset_id", id).order("assigned_at", { ascending: false }).order("created_at", { ascending: false }),
    getLookups(),
    isAdmin ? supabase.from("asset_secrets").select("ciphertext").eq("asset_id", id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("maintenance_logs").select("*").eq("asset_id", id).order("performed_at", { ascending: false }),
    supabase.from("maintenance_schedule").select("next_due, interval_months").eq("asset_id", id).maybeSingle(),
  ]);
  if (!asset) notFound();
  const a = asset as Asset;

  const companies = byId(lookups.companies);
  const employees = byId(lookups.employees);
  const departments = byId(lookups.departments);
  const locations = byId(lookups.locations);
  const holder = a.holder_employee_id ? employees.get(a.holder_employee_id) : undefined;
  const secrets = secretRow.data ? decryptSecrets(secretRow.data.ciphertext) : {};
  const specItems = publicFields(a.category).filter((f) => a.specs?.[f.key]);
  const secretList = secretFields(a.category);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <CategoryIcon category={a.category} size="lg" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{a.name}</h1>
              <Badge tone={STATUS_TONE[a.status]}>{ASSET_STATUSES[a.status]}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-muted">
              <span className="font-mono">{a.code}</span> · {categoryLabel(a.category)} · {companies.get(a.company_id)?.name}
            </p>
          </div>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <LinkButton variant="secondary" href={`/aset/${a.id}/edit`}>
              <Pencil className="size-4" /> Edit
            </LinkButton>
            <form action={deleteAsset}>
              <input type="hidden" name="id" value={a.id} />
              <ConfirmButton variant="danger" message={`Hapus ${a.code} beserta seluruh riwayatnya? Tindakan ini tidak bisa dibatalkan.`}>
                <Trash className="size-4" /> Hapus
              </ConfirmButton>
            </form>
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Informasi">
            <DefinitionList
              items={[
                {
                  label: "Pemegang",
                  value: holder ? (
                    <Link href={`/karyawan/${holder.id}`} className="font-medium hover:underline">
                      {holder.name}
                    </Link>
                  ) : null,
                },
                { label: "Dipakai bersama", value: a.shared_with },
                { label: "Departemen", value: a.department_id ? departments.get(a.department_id)?.name : null },
                { label: "Lokasi", value: a.location_id ? locations.get(a.location_id)?.name : null },
                { label: "Nomor Seri", value: a.serial_number },
                { label: "Hostname", value: a.hostname },
                { label: "Tanggal Beli", value: a.purchase_date && formatDate(a.purchase_date) },
                { label: "Harga Beli", value: a.purchase_price ? formatRupiah(a.purchase_price) : null },
                { label: "Terakhir Dibersihkan", value: a.last_cleaned_at && formatDate(a.last_cleaned_at) },
                { label: "Catatan", value: a.notes },
              ]}
            />
          </Card>

          {specItems.length > 0 && (
            <Card title="Spesifikasi">
              <DefinitionList items={specItems.map((f) => ({ label: f.label, value: a.specs[f.key] }))} />
            </Card>
          )}

          {isAdmin && secretList.length > 0 && (
            <Card title={<span className="flex items-center gap-1.5"><Lock className="size-3.5" /> Data Sensitif</span>}>
              {Object.keys(secrets).length ? (
                <details>
                  <summary className="cursor-pointer text-sm text-muted">Tampilkan (hanya admin)</summary>
                  <div className="mt-3">
                    <DefinitionList items={secretList.map((f) => ({ label: f.label, value: secrets[f.key] }))} />
                  </div>
                </details>
              ) : (
                <p className="text-sm text-muted">Belum ada data.</p>
              )}
            </Card>
          )}

          {(schedule || (maintenance?.length ?? 0) > 0) && (
            <Card
              title={
                <span className="flex flex-wrap items-center gap-2">
                  Riwayat Maintenance
                  {schedule && (
                    <Badge tone={dueStatus(schedule.next_due, todayISO(), 30).tone}>
                      {schedule.next_due
                        ? `Jatuh tempo ${formatDate(schedule.next_due)} · ${dueStatus(schedule.next_due, todayISO(), 30).label}`
                        : "Belum pernah dicatat"}
                    </Badge>
                  )}
                </span>
              }
              actions={
                isAdmin && (
                  <Link href={`/maintenance/catat?aset=${a.id}`} className="text-xs text-muted hover:text-foreground hover:underline">
                    + Catat
                  </Link>
                )
              }
              flush
            >
              {maintenance?.length ? (
                <Table>
                  <thead>
                    <tr>
                      <Th>Tanggal</Th>
                      <Th>Jenis</Th>
                      <Th>Pekerjaan</Th>
                      <Th className="text-right">Biaya</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(maintenance as MaintenanceLog[]).map((m) => (
                      <tr key={m.id}>
                        <Td className="whitespace-nowrap text-muted">{formatDate(m.performed_at)}</Td>
                        <Td><Badge tone="blue">{MAINTENANCE_TYPES[m.type]}</Badge></Td>
                        <Td className="text-muted">
                          {m.description}
                          {m.performed_by && <span className="text-xs"> — {m.performed_by}</span>}
                        </Td>
                        <Td className="text-right tabular-nums whitespace-nowrap">{m.cost ? formatRupiah(m.cost) : "-"}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <EmptyState>Belum ada catatan maintenance.</EmptyState>
              )}
            </Card>
          )}

          <Card title="Riwayat Serah Terima" flush>
            {history?.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Penerima</Th>
                    <Th>Diserahkan</Th>
                    <Th>Dikembalikan</Th>
                    <Th>Catatan</Th>
                  </tr>
                </thead>
                <tbody>
                  {(history as Assignment[]).map((h) => {
                    const emp = h.employee_id ? employees.get(h.employee_id) : undefined;
                    return (
                      <tr key={h.id}>
                        <Td>
                          {emp ? (
                            <Link href={`/karyawan/${emp.id}`} className="hover:underline">{emp.name}</Link>
                          ) : (
                            departments.get(h.department_id ?? "")?.name ?? "-"
                          )}
                        </Td>
                        <Td className="whitespace-nowrap">{formatDate(h.assigned_at)}</Td>
                        <Td className="whitespace-nowrap">
                          {h.returned_at ? formatDate(h.returned_at) : <Badge tone="blue">Masih dipegang</Badge>}
                        </Td>
                        <Td className="text-muted">{h.notes}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            ) : (
              <EmptyState>Belum ada riwayat serah terima.</EmptyState>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          {isAdmin && (
            <Card title={holder || a.status === "dipakai" ? "Serah Terima / Pengembalian" : "Serahkan Aset"}>
              <HandoverForm
                assetId={a.id}
                hasHolder={!!holder || a.status === "dipakai"}
                today={todayISO()}
                defaultCompanyId={a.company_id}
                departments={lookups.departments}
                employees={lookups.employees.map((e) => ({ ...e, company_name: companies.get(e.company_id)?.name ?? "" }))}
              />
            </Card>
          )}
          {isAdmin && (
            <Card title="Log Perubahan">
              <ActivityList recordIds={[a.id, ...(history ?? []).map((h) => h.id)]} />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
