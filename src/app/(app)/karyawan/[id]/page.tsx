import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryIcon } from "@/components/category-icon";
import { EmployeeForm } from "@/components/employee-form";
import { Badge, Card, DefinitionList, EmptyState, STATUS_TONE, Table, Td, Th } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { ASSET_STATUSES, EMPLOYEE_STATUSES, categoryLabel } from "@/lib/categories";
import { byId, getLookups } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Asset, Assignment } from "@/lib/types";

export const metadata: Metadata = { title: "Detail Karyawan" };
export const instant = false; // data selalu segar, lihat (app)/layout.tsx

export default async function EmployeeDetailPage({ params }: PageProps<"/karyawan/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  const supabase = await createClient();
  const [lookups, { data: assets }, { data: history }] = await Promise.all([
    getLookups(),
    supabase.from("assets").select("*").eq("holder_employee_id", id).order("code"),
    supabase
      .from("asset_assignments")
      .select("*, asset:asset_id(id, code, name, category)")
      .eq("employee_id", id)
      .order("assigned_at", { ascending: false }),
  ]);
  const employee = lookups.employees.find((e) => e.id === id);
  if (!employee) notFound();

  const company = byId(lookups.companies).get(employee.company_id);
  const dept = employee.department_id ? byId(lookups.departments).get(employee.department_id) : undefined;
  const held = (assets ?? []) as Asset[];
  const past = ((history ?? []) as (Assignment & { asset: Pick<Asset, "id" | "code" | "name" | "category"> | null })[]).filter(
    (h) => h.returned_at,
  );

  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-subtle text-lg font-semibold ring-1 ring-border">
          {employee.name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{employee.name}</h1>
            <Badge tone={STATUS_TONE[employee.status]}>{EMPLOYEE_STATUSES[employee.status]}</Badge>
          </div>
          <p className="text-sm text-muted">
            {[employee.position, dept?.name, company?.name].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      {employee.status !== "aktif" && held.length > 0 && (
        <p className="mb-5 rounded-lg bg-amber-400/15 px-4 py-3 text-sm text-amber-900 dark:text-amber-300">
          Karyawan ini berstatus <b>{EMPLOYEE_STATUSES[employee.status]}</b> tetapi masih tercatat memegang {held.length} aset.
          Buka aset di bawah lalu catat pengembalian atau serah terima ke pemegang baru.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title={`Aset yang Dipegang (${held.length})`} flush>
            {held.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Aset</Th>
                    <Th>Kode</Th>
                    <Th>Kategori</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {held.map((a) => (
                    <tr key={a.id} className="hover:bg-subtle/60">
                      <Td>
                        <Link href={`/aset/${a.id}`} className="flex items-center gap-2.5 font-medium hover:underline">
                          <CategoryIcon category={a.category} />
                          {a.name}
                        </Link>
                      </Td>
                      <Td className="font-mono text-xs text-muted">{a.code}</Td>
                      <Td className="text-muted">{categoryLabel(a.category)}</Td>
                      <Td>
                        <Badge tone={STATUS_TONE[a.status]}>{ASSET_STATUSES[a.status]}</Badge>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState>Tidak sedang memegang aset.</EmptyState>
            )}
          </Card>

          <Card title="Riwayat Aset Sebelumnya" flush>
            {past.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Aset</Th>
                    <Th>Diterima</Th>
                    <Th>Dikembalikan</Th>
                    <Th>Catatan</Th>
                  </tr>
                </thead>
                <tbody>
                  {past.map((h) => (
                    <tr key={h.id}>
                      <Td>
                        {h.asset ? (
                          <Link href={`/aset/${h.asset.id}`} className="hover:underline">
                            {h.asset.code} · {h.asset.name}
                          </Link>
                        ) : (
                          "(aset dihapus)"
                        )}
                      </Td>
                      <Td className="whitespace-nowrap">{formatDate(h.assigned_at)}</Td>
                      <Td className="whitespace-nowrap">{formatDate(h.returned_at)}</Td>
                      <Td className="text-muted">{h.notes}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState>Belum ada riwayat.</EmptyState>
            )}
          </Card>
        </div>

        <Card title={user.role === "admin" ? "Edit Data Karyawan" : "Data Karyawan"}>
          {user.role === "admin" ? (
            <EmployeeForm employee={employee} companies={lookups.companies} departments={lookups.departments} />
          ) : (
            <DefinitionList
              items={[
                { label: "Unit", value: company?.name },
                { label: "Departemen", value: dept?.name },
                { label: "Jabatan", value: employee.position },
                { label: "Catatan", value: employee.notes },
              ]}
            />
          )}
        </Card>
      </div>
    </>
  );
}
