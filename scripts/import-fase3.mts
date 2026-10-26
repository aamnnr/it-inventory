// Import data Fase 3 dari Excel lama:
//   - sheet "LANGGANAN IT SUPPORT" (Futake, Futastone & Futafarm) → langganan & lisensi
//   - sheet "Laptop Pribadi" / "LaptopPC Pribadi"                 → laptop pribadi & riwayat perbaikan
//
//   npm run import:fase3             → cek saja, membuat import-output/laporan-fase3.md
//   npm run import:fase3 -- --commit → memasukkan ke Supabase
//
// Karyawan dicocokkan dengan data yang SUDAH ada di Supabase (hasil import Fase 1),
// jadi script ini butuh koneksi Supabase juga saat mode cek.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";

const ROOT = join(import.meta.dirname, "..");
const DATA_DIR = join(ROOT, "Data");
const OUT_DIR = join(ROOT, "import-output");
const COMMIT = process.argv.includes("--commit");
if (existsSync(join(ROOT, ".env.local"))) process.loadEnvFile(join(ROOT, ".env.local"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diisi di .env.local");
  process.exit(1);
}
const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

// ---------------------------------------------------------------------------
// Helper sel Excel
// ---------------------------------------------------------------------------
type Cell = ExcelJS.CellValue;
function raw(v: Cell): unknown {
  if (v && typeof v === "object" && !(v instanceof Date)) {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("result" in v || "formula" in v || "sharedFormula" in v) return (v as { result?: unknown }).result;
    if ("text" in v) return v.text;
    if ("error" in v) return null;
  }
  return v;
}
function text(v: Cell): string | undefined {
  const r = raw(v);
  if (r === null || r === undefined || typeof r === "boolean") return undefined;
  if (r instanceof Date) return r.toISOString().slice(0, 10);
  if (typeof r === "number") return Number.isInteger(r) ? String(r) : String(Math.round(r));
  const s = String(r).replace(/\s+/g, " ").trim();
  return s && s !== "-" ? s : undefined;
}
function date(v: Cell): string | undefined {
  const r = raw(v);
  if (r instanceof Date) return r.toISOString().slice(0, 10);
  const m = text(v)?.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (!m) return undefined;
  return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}
function rupiah(v: Cell): number | undefined {
  const r = raw(v);
  if (typeof r === "number") return r;
  const digits = text(v)?.replace(/[^\d]/g, "");
  return digits ? Number(digits) : undefined;
}

type Sheet = { rows: { n: number; get: (...names: string[]) => Cell }[] };
function readSheet(ws: ExcelJS.Worksheet): Sheet {
  const headers = new Map<string, number>();
  ws.getRow(1).eachCell((cell, col) => {
    const h = text(cell.value);
    if (h) headers.set(h.toUpperCase(), col);
  });
  const rows: Sheet["rows"] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    rows.push({
      n,
      get: (...names) => {
        for (const name of names) {
          const col = headers.get(name.toUpperCase());
          if (col) return row.getCell(col).value;
        }
        return null;
      },
    });
  });
  return { rows };
}

async function openWorkbook(match: RegExp) {
  const file = readdirSync(DATA_DIR).find((f) => match.test(f) && !f.startsWith("~$"));
  if (!file) throw new Error(`File ${match} tidak ditemukan di folder Data/`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(join(DATA_DIR, file));
  return wb;
}

const todayWib = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

/** "Setiap tanggal 26" → tanggal 26 terdekat mulai hari ini */
function nextMonthlyDue(day: number) {
  const [y, m, d] = todayWib.split("-").map(Number);
  const target = (yy: number, mm: number) => {
    const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    return new Date(Date.UTC(yy, mm - 1, Math.min(day, last))).toISOString().slice(0, 10);
  };
  return d <= day ? target(y, m) : target(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1);
}

// ---------------------------------------------------------------------------
// Data yang sudah ada di Supabase
// ---------------------------------------------------------------------------
const [{ data: companies, error: cErr }, { data: departments }, { data: employees }] = await Promise.all([
  sb.from("companies").select("id, code, name"),
  sb.from("departments").select("id, company_id, name"),
  sb.from("employees").select("id, company_id, name"),
]);
if (cErr || !companies?.length) {
  console.error("Data Fase 1 belum ada di Supabase. Jalankan dulu npm run import -- --commit.");
  process.exit(1);
}
const companyId = (code: string) => companies.find((c) => c.code === code)!.id;

const review = { notes: [] as string[], createdEmployees: [] as string[], matched: [] as string[] };

// ---------------------------------------------------------------------------
// Langganan
// ---------------------------------------------------------------------------
type Sub = Record<string, unknown> & { name: string };
const subs: Sub[] = [];

async function readSubscriptions(fileMatch: RegExp, unitFor: (name: string, email?: string) => string) {
  const wb = await openWorkbook(fileMatch);
  const ws = wb.getWorksheet("LANGGANAN IT SUPPORT");
  if (!ws) return;
  for (const row of readSheet(ws).rows) {
    const name = text(row.get("NAMA"));
    if (!name) continue;
    const cycleText = text(row.get("RENTANG"))?.toLowerCase() ?? "";
    const billing_cycle = cycleText.startsWith("tahun") ? "tahunan" : cycleText.startsWith("bulan") ? "bulanan" : "sekali";
    const renewRaw = row.get("TGL PERPANJANG");
    const dayMatch = text(renewRaw)?.match(/tanggal\s+(\d{1,2})/i);
    const next_due_date = dayMatch ? nextMonthlyDue(Number(dayMatch[1])) : date(renewRaw);
    let email = text(row.get("EMAIL TERKAIT"));
    if (email?.includes(",")) {
      review.notes.push(`Email "${email}" (${name}) diperbaiki menjadi "${email.replace(/,/g, ".")}"`);
      email = email.replace(/,/g, ".");
    }
    const contact = [text(row.get("NOMOR PELANGGAN", "NOMOR TERKAIT")), text(row.get("KONTAK VENDOR"))].filter(Boolean).join(" / ");
    const unit = unitFor(name, email);
    subs.push({
      id: randomUUID(),
      name,
      kind: /internet/i.test(name) ? "internet" : /lisensi|license/i.test(name) ? "lisensi" : "lainnya",
      company_id: companyId(unit),
      vendor: name.replace(/^(internet|lisensi)\s+/i, "") || null,
      account_number: text(row.get("ID")) ?? null,
      billing_cycle,
      amount: rupiah(row.get("NOMINAL")) ?? null,
      start_date: date(row.get("TGL BELI")) ?? null,
      next_due_date: next_due_date ?? null,
      contact: contact || null,
      email: email ?? null,
      description: text(row.get("BENEFIT")) ?? null,
      notes: dayMatch ? `Jatuh tempo setiap tanggal ${dayMatch[1]}` : null,
    });
    if (!next_due_date) review.notes.push(`${name}: tanggal jatuh tempo tidak terbaca, mohon diisi manual`);
  }
}

await readSubscriptions(/FUTAKE\.xlsx$/i, () => "FTK");
await readSubscriptions(/FUTASTONE/i, (name, email) => (/futafarm/i.test(`${name} ${email}`) ? "FTF" : "FTS"));

// ---------------------------------------------------------------------------
// Laptop pribadi
// ---------------------------------------------------------------------------
type NewEmployee = { id: string; company_id: string; department_id: string | null; name: string; position: string | null; notes: string };
const newEmployees: NewEmployee[] = [];
const newDepartments: { id: string; company_id: string; name: string }[] = [];
const devices: { id: string; employee_id: string; owner: string; unit: string }[] = [];
const repairs: Record<string, unknown>[] = [];

function findOrCreateEmployee(unit: string, name: string, dept?: string, position?: string) {
  const cid = companyId(unit);
  const pool = [...(employees ?? []), ...newEmployees].filter((e) => e.company_id === cid);
  const exact = pool.find((e) => e.name.toLowerCase() === name.toLowerCase());
  if (exact) return exact.id;
  const byFirst = pool.filter((e) => e.name.toLowerCase().split(" ")[0] === name.toLowerCase().split(" ")[0]);
  if (byFirst.length === 1) {
    review.matched.push(`${unit}: "${name}" dianggap sama dengan "${byFirst[0].name}"`);
    return byFirst[0].id;
  }
  let departmentId: string | null = null;
  if (dept) {
    const d = dept.toUpperCase();
    const existing = [...(departments ?? []), ...newDepartments].find((x) => x.company_id === cid && x.name === d);
    if (existing) departmentId = existing.id;
    else {
      const nd = { id: randomUUID(), company_id: cid, name: d };
      newDepartments.push(nd);
      departmentId = nd.id;
    }
  }
  const e: NewEmployee = {
    id: randomUUID(),
    company_id: cid,
    department_id: departmentId,
    name,
    position: position ?? null,
    notes: "Ditambahkan dari sheet Laptop Pribadi",
  };
  newEmployees.push(e);
  review.createdEmployees.push(`${unit}: ${name}${dept ? ` (${dept.toUpperCase()})` : ""}${position ? ` — ${position}` : ""}`);
  return e.id;
}

async function readPersonal(fileMatch: RegExp, sheetName: string, unit: string, secondColumnIs: "department" | "position") {
  const wb = await openWorkbook(fileMatch);
  const ws = wb.getWorksheet(sheetName);
  if (!ws) return;
  const byOwner = new Map<string, string>();
  for (const row of readSheet(ws).rows) {
    const owner = text(row.get("NAMA PIC"));
    if (!owner) continue;
    const second = text(row.get("DEPARTEMEN"));
    let deviceId = byOwner.get(owner.toLowerCase());
    if (!deviceId) {
      const employeeId = findOrCreateEmployee(
        unit,
        owner,
        secondColumnIs === "department" ? second : undefined,
        secondColumnIs === "position" ? second : undefined,
      );
      deviceId = randomUUID();
      byOwner.set(owner.toLowerCase(), deviceId);
      devices.push({ id: deviceId, employee_id: employeeId, owner, unit });
    }
    const item = text(row.get("ITEM PERBAIKAN"));
    if (item) {
      repairs.push({
        device_id: deviceId,
        repaired_at: date(row.get("TANGGAL")) ?? todayWib,
        session: text(row.get("SESI PERBAIKAN")) ?? null,
        item,
        cost: rupiah(row.get("HARGA")) ?? null,
      });
    }
  }
}

await readPersonal(/FUTAKE\.xlsx$/i, "Laptop Pribadi", "FTK", "department");
await readPersonal(/FUTASTONE/i, "LaptopPC Pribadi", "FTS", "position");

// ---------------------------------------------------------------------------
// Laporan
// ---------------------------------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });
const fmt = (n: unknown) => (typeof n === "number" ? `Rp${n.toLocaleString("id-ID")}` : "-");
const lines = [
  `# Laporan Import Fase 3`,
  ``,
  `Dibuat: ${new Date().toLocaleString("id-ID")}`,
  ``,
  `## Langganan & Lisensi (${subs.length})`,
  ``,
  `| Nama | Unit | Siklus | Nominal | Jatuh tempo berikutnya |`,
  `|---|---|---|---:|---|`,
  ...subs.map(
    (s) =>
      `| ${s.name} | ${companies.find((c) => c.id === s.company_id)?.name} | ${s.billing_cycle} | ${fmt(s.amount)} | ${s.next_due_date ?? "-"} |`,
  ),
  ``,
  `## Laptop Pribadi (${devices.length} pemilik, ${repairs.length} catatan perbaikan)`,
  ``,
  ...devices.map((d) => `- ${d.unit}: ${d.owner}`),
  ``,
  `## Karyawan baru yang ditambahkan (${review.createdEmployees.length})`,
  ``,
  `_Pemilik laptop pribadi yang belum ada di data karyawan._`,
  ``,
  ...(review.createdEmployees.length ? review.createdEmployees.map((x) => `- ${x}`) : ["- (tidak ada)"]),
  ``,
  `## Perlu dicek (${review.matched.length + review.notes.length})`,
  ``,
  ...[...review.matched, ...review.notes].map((x) => `- ${x}`),
  `- Pemilik dari file Futastone & Futafarm dicatat di unit Futastone. Pindahkan di halaman Karyawan bila salah.`,
];
writeFileSync(join(OUT_DIR, "laporan-fase3.md"), lines.join("\n"), "utf8");

console.log(`Langganan: ${subs.length} | Laptop pribadi: ${devices.length} | Perbaikan: ${repairs.length} | Karyawan baru: ${newEmployees.length}`);
console.log(`Laporan: import-output/laporan-fase3.md`);
if (!COMMIT) {
  console.log(`\nMode cek saja — database tidak diubah. Jalankan "npm run import:fase3 -- --commit" untuk memasukkan data.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Commit
// ---------------------------------------------------------------------------
for (const table of ["subscriptions", "personal_devices"]) {
  const { data, error } = await sb.from(table).select("id").limit(1);
  if (error) {
    console.error(`Tabel ${table} belum ada: jalankan dulu supabase/migrations/0003_maintenance.sql. (${error.message})`);
    process.exit(1);
  }
  if (data.length) {
    console.error(`Tabel ${table} sudah berisi data. Import dibatalkan agar tidak dobel.`);
    process.exit(1);
  }
}

async function insert(table: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const { error } = await sb.from(table).insert(rows);
  if (error) throw new Error(`Gagal insert ${table}: ${error.message}`);
  console.log(`✓ ${table}: ${rows.length}`);
}

await insert("departments", newDepartments);
await insert("employees", newEmployees);
await insert("subscriptions", subs);
await insert("personal_devices", devices.map(({ id, employee_id }) => ({ id, employee_id })));
await insert("personal_repairs", repairs);
console.log("\nImport Fase 3 selesai.");
