import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";
import { DeviceForm, RepairForm } from "@/components/personal-forms";
import { Card, DefinitionList, EmptyState, Table, Td, Th } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import type { PersonalDevice, PersonalRepair } from "@/lib/care";
import { byId, getLookups } from "@/lib/data";
import { formatDate, formatRupiah, todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { deleteRepair } from "../actions";

export const metadata: Metadata = { title: "Laptop Pribadi" };
export const instant = false; // data selalu segar, lihat (app)/layout.tsx

export default async function DevicePage({ params }: PageProps<"/laptop-pribadi/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  const isAdmin = user.role === "admin";
  const supabase = await createClient();
  const [{ data: device }, { data: repairs }, lookups] = await Promise.all([
    supabase.from("personal_devices").select("*").eq("id", id).maybeSingle(),
    supabase.from("personal_repairs").select("*").eq("device_id", id).order("repaired_at", { ascending: false }).order("created_at"),
    getLookups(),
  ]);
  if (!device) notFound();
  const d = device as PersonalDevice;
  const owner = byId(lookups.employees).get(d.employee_id);
  const company = owner ? byId(lookups.companies).get(owner.company_id) : undefined;
  const dept = owner?.department_id ? byId(lookups.departments).get(owner.department_id) : undefined;
  const list = ((repairs ?? []) as PersonalRepair[]).map((r) => ({ ...r, cost: r.cost === null ? null : Number(r.cost) }));
  const total = list.reduce((s, r) => s + (r.cost ?? 0), 0);
  const sessions = new Set(list.map((r) => r.session).filter(Boolean));

  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">
          Laptop Pribadi {owner && <Link href={`/karyawan/${owner.id}`} className="hover:underline">{owner.name}</Link>}
        </h1>
        <p className="mt-0.5 text-sm text-muted">
          {[d.device, dept?.name ?? owner?.position, company?.name].filter(Boolean).join(" · ")}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title={`Riwayat Perbaikan (${list.length}) · total ${formatRupiah(total)}`} flush>
            {list.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Tanggal</Th>
                    <Th>Sesi</Th>
                    <Th>Barang / Pekerjaan</Th>
                    <Th className="text-right">Biaya</Th>
                    <Th>Catatan</Th>
                    {isAdmin && <Th />}
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id}>
                      <Td className="whitespace-nowrap">{formatDate(r.repaired_at)}</Td>
                      <Td className="whitespace-nowrap text-muted">{r.session ?? "-"}</Td>
                      <Td>{r.item}</Td>
                      <Td className="text-right tabular-nums whitespace-nowrap">{formatRupiah(r.cost)}</Td>
                      <Td className="text-muted">{r.notes ?? "-"}</Td>
                      {isAdmin && (
                        <Td className="w-10">
                          <form action={deleteRepair}>
                            <input type="hidden" name="id" value={r.id} />
                            <ConfirmButton variant="ghost" className="h-7 px-2 text-xs" message="Hapus catatan perbaikan ini?">
                              Hapus
                            </ConfirmButton>
                          </form>
                        </Td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState>Belum ada perbaikan yang dicatat.</EmptyState>
            )}
          </Card>
          {!isAdmin && (
            <Card title="Informasi">
              <DefinitionList items={[{ label: "Laptop", value: d.device }, { label: "Catatan", value: d.notes }]} />
            </Card>
          )}
        </div>

        {isAdmin && (
          <div className="space-y-5">
            <Card title="Catat Perbaikan">
              <RepairForm deviceId={d.id} today={todayISO()} nextSession={`Perbaikan ${sessions.size + 1}`} />
            </Card>
            <Card title="Data Laptop">
              <DeviceForm device={d} />
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
