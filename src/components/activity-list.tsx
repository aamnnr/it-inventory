import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";

export type ActivityRow = {
  id: number;
  user_id: string | null;
  table_name: string;
  record_id: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  changes: Record<string, unknown> | null;
  created_at: string;
};

const TABLE_LABEL: Record<string, string> = {
  assets: "aset",
  asset_assignments: "serah terima",
  employees: "karyawan",
  asset_secrets: "data sensitif",
  stock_items: "barang stok",
  stock_movements: "transaksi stok",
  maintenance_logs: "catatan maintenance",
  subscriptions: "langganan",
  subscription_payments: "pembayaran langganan",
  personal_devices: "laptop pribadi",
  personal_repairs: "perbaikan laptop pribadi",
};
const ACTION_LABEL = { INSERT: "menambah", UPDATE: "mengubah", DELETE: "menghapus" };
const FIELD_LABEL: Record<string, string> = {
  status: "status",
  name: "nama",
  holder_employee_id: "pemegang",
  department_id: "departemen",
  location_id: "lokasi",
  company_id: "unit",
  specs: "spesifikasi",
  notes: "catatan",
  returned_at: "tgl kembali",
  shared_with: "dipakai bersama",
  position: "jabatan",
  serial_number: "nomor seri",
  hostname: "hostname",
  category: "kategori",
  purchase_date: "tgl beli",
  purchase_price: "harga",
  last_cleaned_at: "tgl dibersihkan",
  min_stock: "stok minimum",
  quantity: "jumlah",
  unit_price: "harga",
  active: "status aktif",
  location: "lokasi",
};

export function describeActivity(row: ActivityRow) {
  const what = `${ACTION_LABEL[row.action]} ${TABLE_LABEL[row.table_name] ?? row.table_name}`;
  if (row.action !== "UPDATE" || !row.changes) return what;
  const fields = Object.keys(row.changes).map((k) => FIELD_LABEL[k] ?? k);
  return `${what}: ${fields.join(", ")}`;
}

/** Riwayat perubahan untuk record tertentu (hanya terlihat oleh admin karena RLS). */
export async function ActivityList({ recordIds }: { recordIds: string[] }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activity_log")
    .select("*")
    .in("record_id", recordIds)
    .order("created_at", { ascending: false })
    .limit(20);
  const rows = (data ?? []) as ActivityRow[];
  if (!rows.length) return <p className="text-sm text-muted">Belum ada perubahan.</p>;

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[]);
  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  return (
    <ol className="space-y-3 text-sm">
      {rows.map((r) => (
        <li key={r.id} className="border-l-2 border-border pl-3">
          <p>
            <span className="font-medium">{r.user_id ? names.get(r.user_id) ?? "Pengguna" : "Sistem / import"}</span>{" "}
            {describeActivity(r)}
          </p>
          <p className="text-xs text-muted">{formatDateTime(r.created_at)}</p>
        </li>
      ))}
    </ol>
  );
}
