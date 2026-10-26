import type { Metadata } from "next";
import Link from "next/link";
import { describeActivity, type ActivityRow } from "@/components/activity-list";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Log Aktivitas" };
export const instant = false; // data selalu segar, lihat (app)/layout.tsx

const ACTION_TONE = { INSERT: "green", UPDATE: "blue", DELETE: "red" } as const;

export default async function LogPage() {
  const user = await getCurrentUser();
  if (user.role !== "admin") {
    return (
      <>
        <PageHeader title="Log Aktivitas" />
        <EmptyState>Log aktivitas hanya bisa dilihat oleh admin.</EmptyState>
      </>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(200);
  const rows = (data ?? []) as ActivityRow[];

  const ids = (table: string) => [...new Set(rows.filter((r) => r.table_name === table && r.record_id).map((r) => r.record_id!))];
  const movementItemIds = rows
    .filter((r) => r.table_name === "stock_movements")
    .map((r) => (r.changes as { item_id?: string } | null)?.item_id)
    .filter(Boolean) as string[];
  const [{ data: profiles }, { data: assets }, { data: employees }, { data: assignments }, { data: movements }] =
    await Promise.all([
      supabase.from("profiles").select("id, full_name"),
      supabase.from("assets").select("id, code, name").in("id", [...ids("assets"), ...ids("asset_secrets")]),
      supabase.from("employees").select("id, name").in("id", ids("employees")),
      supabase.from("asset_assignments").select("id, asset_id").in("id", ids("asset_assignments")),
      supabase.from("stock_movements").select("id, item_id").in("id", ids("stock_movements")),
    ]);
  const movementMap = new Map((movements ?? []).map((m) => [m.id, m.item_id]));
  const { data: stockItems } = await supabase
    .from("stock_items")
    .select("id, code, name")
    .in("id", [...new Set([...ids("stock_items"), ...movementItemIds, ...movementMap.values()])]);
  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const assetMap = new Map((assets ?? []).map((a) => [a.id, a]));
  const empMap = new Map((employees ?? []).map((e) => [e.id, e]));
  const assignMap = new Map((assignments ?? []).map((a) => [a.id, a.asset_id]));
  const stockMap = new Map((stockItems ?? []).map((i) => [i.id, i]));

  function target(r: ActivityRow) {
    const snapshot = r.changes as { code?: string; name?: string; asset_id?: string; item_id?: string } | null;
    if (r.table_name === "stock_items" || r.table_name === "stock_movements") {
      const itemId = r.table_name === "stock_items" ? r.record_id : movementMap.get(r.record_id ?? "") ?? snapshot?.item_id;
      const i = itemId ? stockMap.get(itemId) : undefined;
      if (i) return <Link href={`/stok/${i.id}`} className="hover:underline">{i.code} · {i.name}</Link>;
      return snapshot?.code ? `${snapshot.code} (dihapus)` : "-";
    }
    if (r.table_name === "employees") {
      const e = r.record_id ? empMap.get(r.record_id) : undefined;
      return e ? <Link href={`/karyawan/${e.id}`} className="hover:underline">{e.name}</Link> : snapshot?.name ?? "-";
    }
    const assetId = r.table_name === "asset_assignments" ? assignMap.get(r.record_id ?? "") ?? snapshot?.asset_id : r.record_id;
    const a = assetId ? assetMap.get(assetId) : undefined;
    if (a) return <Link href={`/aset/${a.id}`} className="hover:underline">{a.code} · {a.name}</Link>;
    return snapshot?.code ? `${snapshot.code} (dihapus)` : "-";
  }

  return (
    <>
      <PageHeader title="Log Aktivitas" subtitle="200 perubahan terakhir. Isi data sensitif tidak pernah dicatat di log." />
      <Card flush>
        {rows.length === 0 ? (
          <EmptyState>Belum ada aktivitas.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Waktu</Th>
                <Th>Pengguna</Th>
                <Th>Aksi</Th>
                <Th>Data</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap text-muted">{formatDateTime(r.created_at)}</Td>
                  <Td className="whitespace-nowrap">{r.user_id ? names.get(r.user_id) ?? "Pengguna" : "Sistem / import"}</Td>
                  <Td>
                    <span className="flex items-center gap-2">
                      <Badge tone={ACTION_TONE[r.action]}>{r.action === "INSERT" ? "Tambah" : r.action === "UPDATE" ? "Ubah" : "Hapus"}</Badge>
                      <span className="text-muted">{describeActivity(r)}</span>
                    </span>
                  </Td>
                  <Td>{target(r)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
