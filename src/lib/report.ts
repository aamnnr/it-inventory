import "server-only";
import ExcelJS from "exceljs";
import { BILLING_CYCLES, MAINTENANCE_TYPES, SUBSCRIPTION_KINDS, dueStatus, monthlyCost, type Subscription } from "./care";
import { ASSET_STATUSES, EMPLOYEE_STATUSES, categoryLabel, publicFields, type AssetCategory } from "./categories";
import { byId, getLookups } from "./data";
import { todayISO } from "./format";
import { MOVEMENT_TYPES } from "./stock";
import { getStockLevels } from "./stock-query";
import { createClient } from "./supabase/server";

export type ReportOptions = {
  /** kode unit bisnis, kosong = semua */
  unit?: string;
  /** periode transaksi (YYYY-MM-DD), dipakai untuk transaksi stok, maintenance, pembayaran, perbaikan */
  from: string;
  to: string;
};

const RUPIAH = '"Rp"#,##0';
const DATE = "dd mmm yyyy";

type Column = { header: string; key: string; width?: number; numFmt?: string };

function addSheet(wb: ExcelJS.Workbook, name: string, columns: Column[], rows: Record<string, unknown>[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 16, style: c.numFmt ? { numFmt: c.numFmt } : {} }));
  for (const r of rows) ws.addRow(r);
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF18181B" } };
  header.alignment = { vertical: "middle" };
  header.height = 20;
  if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  ws.eachRow((row, n) => {
    if (n > 1) row.alignment = { vertical: "top", wrapText: true };
  });
  return ws;
}

/** "2026-10-26" → Date untuk sel tanggal Excel */
const d = (v: string | null | undefined) => (v ? new Date(`${v}T00:00:00Z`) : null);
const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

export async function buildReport(opts: ReportOptions) {
  const supabase = await createClient();
  const lookups = await getLookups();
  const companies = byId(lookups.companies);
  const employees = byId(lookups.employees);
  const departments = byId(lookups.departments);
  const locations = byId(lookups.locations);
  const unit = opts.unit ? lookups.companies.find((c) => c.code === opts.unit) : undefined;
  const inUnit = (companyId: string | null | undefined) => !unit || companyId === unit.id;
  const inPeriod = (date: string | null | undefined) => !!date && date >= opts.from && date <= opts.to;
  const today = todayISO();

  const [assetsRes, schedRes, logsRes, movesRes, subsRes, paysRes, devicesRes, repairsRes, stock] = await Promise.all([
    supabase.from("assets").select("*").order("code"),
    supabase.from("maintenance_schedule").select("*"),
    supabase.from("maintenance_logs").select("*").order("performed_at"),
    supabase.from("stock_movements").select("*, item:item_id(code, name, unit)").order("moved_at"),
    supabase.from("subscriptions").select("*").order("next_due_date"),
    supabase.from("subscription_payments").select("*").order("paid_at"),
    supabase.from("personal_devices").select("*"),
    supabase.from("personal_repairs").select("*").order("repaired_at"),
    getStockLevels(),
  ]);
  for (const r of [assetsRes, schedRes, logsRes, movesRes, subsRes, paysRes, devicesRes, repairsRes]) {
    if (r.error) throw new Error(r.error.message);
  }

  const assets = (assetsRes.data ?? []).filter((a) => inUnit(a.company_id));
  const assetById = new Map((assetsRes.data ?? []).map((a) => [a.id, a]));
  const subs = ((subsRes.data ?? []) as Subscription[]).filter((s) => inUnit(s.company_id));
  const subById = new Map(subs.map((s) => [s.id, s]));
  const devices = (devicesRes.data ?? []).filter((dv) => inUnit(employees.get(dv.employee_id)?.company_id));
  const deviceById = new Map(devices.map((dv) => [dv.id, dv]));
  const moves = (movesRes.data ?? []).filter(
    (m) => inPeriod(m.moved_at) && (!unit || m.type !== "keluar" || m.recipient_company_id === unit.id),
  );

  const wb = new ExcelJS.Workbook();
  wb.creator = "Inventaris IT KFG";
  wb.created = new Date();

  // ---------- Ringkasan ----------
  const summary = wb.addWorksheet("Ringkasan");
  summary.columns = [{ width: 38 }, { width: 22 }];
  const line = (label: string, value: unknown, fmt?: string) => {
    const row = summary.addRow([label, value]);
    if (fmt) row.getCell(2).numFmt = fmt;
    return row;
  };
  summary.addRow(["Laporan Inventaris IT — Kembar Futa Group"]).font = { bold: true, size: 14 };
  line("Unit bisnis", unit?.name ?? "Semua unit");
  line("Periode transaksi", `${opts.from} s/d ${opts.to}`);
  line("Dibuat", new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }));
  summary.addRow([]);
  summary.addRow(["Aset"]).font = { bold: true };
  line("Total aset", assets.length);
  for (const [status, label] of Object.entries(ASSET_STATUSES)) line(`  ${label}`, assets.filter((a) => a.status === status).length);
  line("Total nilai pembelian tercatat", assets.reduce((s, a) => s + (n(a.purchase_price) ?? 0), 0), RUPIAH);
  summary.addRow([]);
  summary.addRow(["Stok gudang IT (tingkat grup)"]).font = { bold: true };
  line("Jenis barang aktif", stock.filter((i) => i.active).length);
  line("Perlu dibeli lagi", stock.filter((i) => i.active && i.min_stock > 0 && i.stock <= i.min_stock).length);
  line("Perkiraan nilai stok", stock.reduce((s, i) => s + i.stock * (i.avg_price ?? 0), 0), RUPIAH);
  line("Pembelian dalam periode", moves.filter((m) => m.type === "masuk").reduce((s, m) => s + (n(m.unit_price) ?? 0) * m.quantity, 0), RUPIAH);
  summary.addRow([]);
  summary.addRow(["Perawatan"]).font = { bold: true };
  const sched = (schedRes.data ?? []).filter((s) => inUnit(s.company_id));
  line("Maintenance terlambat", sched.filter((s) => s.next_due && s.next_due <= today).length);
  line("Maintenance dikerjakan dalam periode", (logsRes.data ?? []).filter((l) => inPeriod(l.performed_at) && assetById.has(l.asset_id) && inUnit(assetById.get(l.asset_id)!.company_id)).length);
  line("Langganan aktif", subs.filter((s) => s.active).length);
  line("Perkiraan biaya langganan / bulan", subs.reduce((s, x) => s + monthlyCost({ ...x, amount: n(x.amount) }), 0), RUPIAH);

  // ---------- Aset ----------
  addSheet(
    wb,
    "Aset",
    [
      { header: "Kode", key: "code", width: 14 },
      { header: "Unit", key: "unit", width: 18 },
      { header: "Kategori", key: "category", width: 12 },
      { header: "Nama", key: "name", width: 28 },
      { header: "Status", key: "status", width: 12 },
      { header: "Pemegang", key: "holder", width: 18 },
      { header: "Dipakai Bersama", key: "shared", width: 18 },
      { header: "Departemen", key: "dept", width: 18 },
      { header: "Lokasi", key: "loc", width: 18 },
      { header: "Nomor Seri", key: "serial", width: 16 },
      { header: "Hostname", key: "host", width: 18 },
      { header: "Tgl Beli", key: "bought", numFmt: DATE, width: 12 },
      { header: "Harga Beli", key: "price", numFmt: RUPIAH, width: 14 },
      { header: "Terakhir Dibersihkan", key: "cleaned", numFmt: DATE, width: 14 },
      { header: "Spesifikasi", key: "specs", width: 60 },
      { header: "Catatan", key: "notes", width: 30 },
    ],
    assets.map((a) => ({
      code: a.code,
      unit: companies.get(a.company_id)?.name,
      category: categoryLabel(a.category),
      name: a.name,
      status: ASSET_STATUSES[a.status as keyof typeof ASSET_STATUSES],
      holder: a.holder_employee_id ? employees.get(a.holder_employee_id)?.name : null,
      shared: a.shared_with,
      dept: a.department_id ? departments.get(a.department_id)?.name : null,
      loc: a.location_id ? locations.get(a.location_id)?.name : null,
      serial: a.serial_number,
      host: a.hostname,
      bought: d(a.purchase_date),
      price: n(a.purchase_price),
      cleaned: d(a.last_cleaned_at),
      specs: publicFields(a.category as AssetCategory)
        .filter((f) => a.specs?.[f.key])
        .map((f) => `${f.label}: ${a.specs[f.key]}`)
        .join("\n"),
      notes: a.notes,
    })),
  );

  // ---------- Stok ----------
  addSheet(
    wb,
    "Stok",
    [
      { header: "Kode", key: "code", width: 10 },
      { header: "Nama", key: "name", width: 40 },
      { header: "Kategori", key: "category", width: 14 },
      { header: "Stok", key: "stock", width: 8 },
      { header: "Satuan", key: "unit", width: 8 },
      { header: "Min", key: "min", width: 6 },
      { header: "Status", key: "status", width: 14 },
      { header: "Harga Rata-rata", key: "avg", numFmt: RUPIAH, width: 14 },
      { header: "Nilai Stok", key: "value", numFmt: RUPIAH, width: 14 },
      { header: "Lokasi", key: "loc", width: 24 },
      { header: "Printer / Kode Tinta", key: "ink", width: 20 },
    ],
    stock
      .filter((i) => i.active)
      .map((i) => ({
        code: i.code,
        name: i.name,
        category: i.category,
        stock: i.stock,
        unit: i.unit,
        min: i.min_stock,
        status: i.min_stock > 0 && i.stock <= i.min_stock ? "Perlu dibeli" : i.stock <= 0 ? "Habis" : "Tersedia",
        avg: i.avg_price,
        value: i.avg_price ? i.avg_price * i.stock : null,
        loc: i.location,
        ink: [i.printer, i.ink_code].filter(Boolean).join(" · ") || null,
      })),
  );

  // ---------- Transaksi stok ----------
  addSheet(
    wb,
    "Transaksi Stok",
    [
      { header: "Tanggal", key: "date", numFmt: DATE, width: 12 },
      { header: "Kode", key: "code", width: 10 },
      { header: "Barang", key: "item", width: 36 },
      { header: "Jenis", key: "type", width: 14 },
      { header: "Jumlah", key: "qty", width: 8 },
      { header: "Harga Satuan", key: "price", numFmt: RUPIAH, width: 14 },
      { header: "Total", key: "total", numFmt: RUPIAH, width: 14 },
      { header: "Unit Penerima", key: "unit", width: 18 },
      { header: "Karyawan Penerima", key: "emp", width: 18 },
      { header: "Keperluan / Penerima", key: "recipient", width: 34 },
      { header: "Catatan", key: "notes", width: 28 },
    ],
    moves.map((m) => ({
      date: d(m.moved_at),
      code: m.item?.code,
      item: m.item?.name,
      type: MOVEMENT_TYPES[m.type as keyof typeof MOVEMENT_TYPES],
      qty: m.quantity,
      price: n(m.unit_price),
      total: m.unit_price ? Number(m.unit_price) * m.quantity : null,
      unit: m.recipient_company_id ? companies.get(m.recipient_company_id)?.name : null,
      emp: m.recipient_employee_id ? employees.get(m.recipient_employee_id)?.name : null,
      recipient: m.recipient,
      notes: m.notes,
    })),
  );

  // ---------- Maintenance ----------
  addSheet(
    wb,
    "Jadwal Maintenance",
    [
      { header: "Kode", key: "code", width: 14 },
      { header: "Aset", key: "name", width: 26 },
      { header: "Unit", key: "unit", width: 18 },
      { header: "Pemegang", key: "holder", width: 18 },
      { header: "Interval (bulan)", key: "interval", width: 10 },
      { header: "Terakhir", key: "last", numFmt: DATE, width: 12 },
      { header: "Jatuh Tempo", key: "next", numFmt: DATE, width: 12 },
      { header: "Status", key: "status", width: 18 },
    ],
    sched
      .sort((a, b) => (a.next_due ?? "9999").localeCompare(b.next_due ?? "9999"))
      .map((s) => ({
        code: s.code,
        name: s.name,
        unit: companies.get(s.company_id)?.name,
        holder: s.holder_employee_id ? employees.get(s.holder_employee_id)?.name : null,
        interval: s.interval_months,
        last: d(s.last_done),
        next: d(s.next_due),
        status: dueStatus(s.next_due, today, 30).label,
      })),
  );
  addSheet(
    wb,
    "Riwayat Maintenance",
    [
      { header: "Tanggal", key: "date", numFmt: DATE, width: 12 },
      { header: "Kode", key: "code", width: 14 },
      { header: "Aset", key: "name", width: 26 },
      { header: "Unit", key: "unit", width: 18 },
      { header: "Jenis", key: "type", width: 12 },
      { header: "Pekerjaan", key: "desc", width: 40 },
      { header: "Biaya", key: "cost", numFmt: RUPIAH, width: 14 },
      { header: "Oleh", key: "by", width: 18 },
    ],
    (logsRes.data ?? [])
      .filter((l) => inPeriod(l.performed_at) && assetById.has(l.asset_id) && inUnit(assetById.get(l.asset_id)!.company_id))
      .map((l) => {
        const a = assetById.get(l.asset_id)!;
        return {
          date: d(l.performed_at),
          code: a.code,
          name: a.name,
          unit: companies.get(a.company_id)?.name,
          type: MAINTENANCE_TYPES[l.type as keyof typeof MAINTENANCE_TYPES],
          desc: l.description,
          cost: n(l.cost),
          by: l.performed_by,
        };
      }),
  );

  // ---------- Langganan ----------
  addSheet(
    wb,
    "Langganan",
    [
      { header: "Nama", key: "name", width: 26 },
      { header: "Jenis", key: "kind", width: 16 },
      { header: "Unit", key: "unit", width: 18 },
      { header: "Siklus", key: "cycle", width: 12 },
      { header: "Nominal", key: "amount", numFmt: RUPIAH, width: 14 },
      { header: "Jatuh Tempo", key: "due", numFmt: DATE, width: 12 },
      { header: "Status", key: "status", width: 16 },
      { header: "ID Pelanggan", key: "account", width: 18 },
      { header: "Kontak", key: "contact", width: 20 },
      { header: "Email", key: "email", width: 26 },
      { header: "Benefit", key: "desc", width: 34 },
    ],
    subs.map((s) => ({
      name: s.name,
      kind: SUBSCRIPTION_KINDS[s.kind],
      unit: s.company_id ? companies.get(s.company_id)?.name : "Grup",
      cycle: BILLING_CYCLES[s.billing_cycle],
      amount: n(s.amount),
      due: d(s.next_due_date),
      status: s.active ? dueStatus(s.next_due_date, today).label : "Nonaktif",
      account: s.account_number,
      contact: s.contact,
      email: s.email,
      desc: s.description,
    })),
  );
  addSheet(
    wb,
    "Pembayaran Langganan",
    [
      { header: "Tanggal Bayar", key: "paid", numFmt: DATE, width: 12 },
      { header: "Langganan", key: "name", width: 26 },
      { header: "Untuk Jatuh Tempo", key: "period", numFmt: DATE, width: 14 },
      { header: "Nominal", key: "amount", numFmt: RUPIAH, width: 14 },
      { header: "Catatan", key: "notes", width: 30 },
    ],
    (paysRes.data ?? [])
      .filter((p) => inPeriod(p.paid_at) && subById.has(p.subscription_id))
      .map((p) => ({
        paid: d(p.paid_at),
        name: subById.get(p.subscription_id)!.name,
        period: d(p.period_due),
        amount: n(p.amount),
        notes: p.notes,
      })),
  );

  // ---------- Laptop pribadi ----------
  addSheet(
    wb,
    "Perbaikan Laptop Pribadi",
    [
      { header: "Tanggal", key: "date", numFmt: DATE, width: 12 },
      { header: "Pemilik", key: "owner", width: 18 },
      { header: "Unit", key: "unit", width: 18 },
      { header: "Laptop", key: "device", width: 22 },
      { header: "Sesi", key: "session", width: 12 },
      { header: "Barang / Pekerjaan", key: "item", width: 30 },
      { header: "Biaya", key: "cost", numFmt: RUPIAH, width: 14 },
      { header: "Catatan", key: "notes", width: 24 },
    ],
    (repairsRes.data ?? [])
      .filter((r) => inPeriod(r.repaired_at) && deviceById.has(r.device_id))
      .map((r) => {
        const dv = deviceById.get(r.device_id)!;
        const owner = employees.get(dv.employee_id);
        return {
          date: d(r.repaired_at),
          owner: owner?.name,
          unit: owner ? companies.get(owner.company_id)?.name : null,
          device: dv.device,
          session: r.session,
          item: r.item,
          cost: n(r.cost),
          notes: r.notes,
        };
      }),
  );

  // ---------- Karyawan ----------
  const holdCount = new Map<string, number>();
  for (const a of assetsRes.data ?? []) if (a.holder_employee_id) holdCount.set(a.holder_employee_id, (holdCount.get(a.holder_employee_id) ?? 0) + 1);
  addSheet(
    wb,
    "Karyawan",
    [
      { header: "Nama", key: "name", width: 22 },
      { header: "Unit", key: "unit", width: 18 },
      { header: "Departemen", key: "dept", width: 20 },
      { header: "Jabatan", key: "position", width: 22 },
      { header: "Status", key: "status", width: 10 },
      { header: "Aset Dipegang", key: "assets", width: 10 },
      { header: "Catatan", key: "notes", width: 30 },
    ],
    lookups.employees
      .filter((e) => inUnit(e.company_id))
      .map((e) => ({
        name: e.name,
        unit: companies.get(e.company_id)?.name,
        dept: e.department_id ? departments.get(e.department_id)?.name : null,
        position: e.position,
        status: EMPLOYEE_STATUSES[e.status],
        assets: holdCount.get(e.id) ?? 0,
        notes: e.notes,
      })),
  );

  return wb;
}
