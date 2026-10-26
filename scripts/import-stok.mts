// Import stok barang dari Excel lama ke Supabase (Fase 2):
//   - DATA INVENTARIS IT SUPPORT KFG NEW.xlsx → sheet INVENTARIS, PEMBELIAN_IN, PEMAKAIAN_OUT
//   - DATA INVENTARIS FUTAKE.xlsx            → sheet TINTA PRINTER
//
//   npm run import:stok             → cek saja, membuat import-output/laporan-stok.md
//   npm run import:stok -- --commit → memasukkan ke Supabase
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

// ---------------------------------------------------------------------------
// Konfigurasi
// ---------------------------------------------------------------------------

/** Kategori barang ditebak dari nama (urutan penting: aturan pertama yang cocok dipakai). */
const CATEGORY_RULES: [string, RegExp][] = [
  ["Tinta & Kertas", /tinta|kertas thermal|cartridge|catridge/i],
  ["Aksesoris", /kabel printer|kabel hdmi|kabel usb|usb extender|usb .*sharing|sharing switch|converter|splitter hdmi|temper|softcase/i],
  ["Perangkat", /^laptop/i],
  ["Sparepart", /\b(ssd|hdd|hardisk|ram|vga|processor|motherboard|hsf|sodimm|caddy|baut)\b|thermal pasta|charger laptop|baterai laptop|memory card|pc atx case/i],
  ["Perangkat", /^laptop|printer|\bups\b|cctv|\bhp poco|infinix hot|monitor|fingerprint|powerbank/i],
  ["Jaringan", /\blan\b|rj45|rj11|switch|router|access point|poe|dongle wifi|barel/i],
  ["Kelistrikan", /steker|colokan|stop kontak|kabel listrik|adaptor|baterai aa/i],
  ["Aksesoris", /mouse|keyboard|mousepad|headset|webcam|temper|softcase|kartu perdana|screen cleaning/i],
  ["Alat Kerja", /obeng|tang|cleaning kit|tester|bor |container|tas |kawat|kabel ties|foam|kabel duct|suntikan/i],
];

/** Baris sheet TINTA PRINTER yang sama dengan barang di gudang KFG. */
const INK_ALIASES: [RegExp, string][] = [
  [/^tinta inxmo merah$/i, "INXMO Tinta Refill Merah"],
  [/^tinta inxmo biru$/i, "INXMO Tinta Refill Biru"],
  [/^tinta inxmo hitam$/i, "INXMO Tinta Refill Hitam"],
  [/^tinta inxmo kuning$/i, "INXMO Tinta Refill Kuning"],
  [/^kertas thermal$/i, "Kertas Thermal 100x150 (Tanpa Merek)"],
];

/** Unit penerima ditebak dari teks "Pengguna". */
const UNIT_RULES: [string, RegExp][] = [
  ["FTK", /futake/i],
  ["FTG", /futago/i],
  ["TVL", /tviling/i],
  ["ATL", /\bATL\b|ayem/i],
  ["FTS", /futastone/i],
  ["FTF", /futafarm/i],
];

const ADJUST_WORDS = /^(rusak|habis|hilang)$/i;

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
type Cell = ExcelJS.CellValue;

function raw(v: Cell): unknown {
  if (v && typeof v === "object" && !(v instanceof Date)) {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("result" in v || "formula" in v || "sharedFormula" in v) return (v as { result?: unknown }).result; // rumus tanpa hasil = kosong
    if ("text" in v) return v.text;
    if ("error" in v) return null;
  }
  return v;
}

function text(v: Cell): string | undefined {
  const r = raw(v);
  if (r === null || r === undefined) return undefined;
  if (r instanceof Date) return r.toISOString().slice(0, 10);
  const s = String(r).replace(/\s+/g, " ").trim();
  return s && s !== "-" ? s : undefined;
}

function num(v: Cell): number | undefined {
  const r = raw(v);
  if (typeof r === "number") return r;
  const n = Number(text(v)?.replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function date(v: Cell): string | undefined {
  const r = raw(v);
  if (r instanceof Date) return r.toISOString().slice(0, 10);
  const m = text(v)?.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (!m) return undefined;
  return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

const key = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

function categoryOf(name: string) {
  return CATEGORY_RULES.find(([, re]) => re.test(name))?.[0] ?? "Lainnya";
}

function unitOf(recipient?: string) {
  return recipient ? UNIT_RULES.find(([, re]) => re.test(recipient))?.[0] : undefined;
}

function rows(ws: ExcelJS.Worksheet) {
  const out: { n: number; cells: Cell[] }[] = [];
  ws.eachRow((row, n) => {
    if (n > 1) out.push({ n, cells: (row.values as Cell[]).slice(1) });
  });
  return out;
}

async function openWorkbook(match: RegExp) {
  const file = readdirSync(DATA_DIR).find((f) => match.test(f) && !f.startsWith("~$"));
  if (!file) throw new Error(`File ${match} tidak ditemukan di folder Data/`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(join(DATA_DIR, file));
  return wb;
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------
type Item = {
  id: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  min_stock: number;
  location?: string;
  printer?: string;
  ink_code?: string;
  notes: string[];
  expectedStock?: number;
};
type Movement = {
  item: Item;
  type: "masuk" | "keluar" | "penyesuaian";
  quantity: number;
  moved_at: string;
  unit_price?: number;
  warranty?: string;
  recipient?: string;
  recipient_unit?: string;
  notes?: string;
  source: string;
};

const items = new Map<string, Item>();
const movements: Movement[] = [];
const review = {
  unmatched: [] as string[],
  mismatch: [] as string[],
  inkMerged: [] as string[],
  placeholderDates: 0,
};

// ---------------------------------------------------------------------------
// Gudang KFG
// ---------------------------------------------------------------------------
const kfg = await openWorkbook(/IT SUPPORT KFG/i);

for (const { cells } of rows(kfg.getWorksheet("INVENTARIS")!)) {
  const code = text(cells[0]);
  const name = text(cells[1]);
  if (!code || !name) continue;
  items.set(key(name), {
    id: randomUUID(),
    code,
    name,
    category: categoryOf(name),
    unit: "pcs",
    min_stock: 0,
    notes: [text(cells[2])].filter(Boolean) as string[],
    expectedStock: num(cells[7]),
  });
}

function findItem(name: string | undefined, where: string) {
  if (!name) return undefined;
  const item = items.get(key(name));
  if (!item) review.unmatched.push(`${where}: "${name}" tidak ada di sheet INVENTARIS`);
  return item;
}

for (const { n, cells } of rows(kfg.getWorksheet("PEMBELIAN_IN")!)) {
  const item = findItem(text(cells[1]), `PEMBELIAN_IN baris ${n}`);
  const qty = num(cells[4]);
  if (!item || !qty) continue;
  // Kadang kolom "Harga" berisi harga total (sama dengan "Total Harga") → bagi dengan jumlah
  const total = num(cells[5]);
  const rawPrice = num(cells[3]);
  const price = rawPrice && qty > 1 && total && rawPrice === total ? rawPrice / qty : rawPrice;
  const warrantyDate = date(cells[2]);
  movements.push({
    item,
    type: "masuk",
    quantity: Math.round(qty),
    moved_at: date(cells[0]) ?? new Date().toISOString().slice(0, 10),
    unit_price: price && price > 0 ? price : undefined,
    warranty: warrantyDate ? `s/d ${warrantyDate}` : text(cells[2]),
    source: `PEMBELIAN_IN baris ${n}`,
  });
}

const firstOutDate = date(rows(kfg.getWorksheet("PEMAKAIAN_OUT")!)[0]?.cells[0]);
for (const { n, cells } of rows(kfg.getWorksheet("PEMAKAIAN_OUT")!)) {
  const item = findItem(text(cells[1]), `PEMAKAIAN_OUT baris ${n}`);
  const qty = num(cells[3]);
  if (!item || !qty) continue;
  const recipient = text(cells[2]);
  const movedAt = date(cells[0]) ?? new Date().toISOString().slice(0, 10);
  if (movedAt === firstOutDate) review.placeholderDates++;
  const adjust = recipient && ADJUST_WORDS.test(recipient);
  movements.push({
    item,
    type: adjust ? "penyesuaian" : "keluar",
    quantity: -Math.round(qty),
    moved_at: movedAt,
    recipient: adjust ? undefined : recipient,
    recipient_unit: adjust ? undefined : unitOf(recipient),
    notes: adjust ? `Dicatat ${recipient!.toUpperCase()} di Excel` : undefined,
    source: `PEMAKAIAN_OUT baris ${n}`,
  });
}

// Cocokkan stok hasil hitung dengan kolom "Sisa Stok" di Excel
for (const item of items.values()) {
  const computed = movements.filter((m) => m.item === item).reduce((s, m) => s + m.quantity, 0);
  if (item.expectedStock !== undefined && computed !== item.expectedStock) {
    review.mismatch.push(`${item.code} ${item.name}: Excel ${item.expectedStock}, hasil hitung transaksi ${computed}`);
  }
}

// ---------------------------------------------------------------------------
// Sheet TINTA PRINTER (Futake)
// ---------------------------------------------------------------------------
const futake = await openWorkbook(/FUTAKE\.xlsx$/i);
let nextCode = Math.max(...[...items.values()].map((i) => Number(i.code.replace(/\D/g, "")) || 0));

for (const { n, cells } of rows(futake.getWorksheet("TINTA PRINTER")!)) {
  const baseName = text(cells[0]);
  if (!baseName) continue;
  const printer = text(cells[1]);
  const inkCode = text(cells[2]);
  const sealed = Math.round(num(cells[3]) ?? 0);
  const usedRaw = raw(cells[4]);
  const used =
    usedRaw instanceof Date
      ? `dibuka ${usedRaw.toISOString().slice(0, 10)}`
      : typeof usedRaw === "number"
        ? usedRaw > 0 ? `${usedRaw} sedang dipakai/terbuka` : undefined
        : text(cells[4]);
  const location = text(cells[5]);
  const updated = date(cells[6]) ?? new Date().toISOString().slice(0, 10);

  const alias = INK_ALIASES.find(([re]) => re.test(baseName))?.[1];
  const existing = alias ? items.get(key(alias)) : undefined;
  if (existing) {
    existing.printer ??= printer;
    existing.location ??= location;
    existing.category = "Tinta & Kertas";
    existing.min_stock = 1;
    if (used) existing.notes.push(`Sheet tinta: ${used}`);
    const computed = movements.filter((m) => m.item === existing).reduce((s, m) => s + m.quantity, 0);
    review.inkMerged.push(
      `"${baseName}" digabung ke ${existing.code} ${existing.name}. Stok utuh di sheet tinta ${sealed}, di gudang KFG ${computed}` +
        (sealed !== computed ? " → **berbeda, mohon dicek fisik**" : ""),
    );
    continue;
  }

  const name = [baseName, printer, inkCode && inkCode !== "-" ? inkCode : undefined].filter(Boolean).join(" ");
  if (items.has(key(name))) continue;
  const item: Item = {
    id: randomUUID(),
    code: `INV${String(++nextCode).padStart(3, "0")}`,
    name,
    category: "Tinta & Kertas",
    unit: /cartridge/i.test(baseName) ? "pcs" : "botol",
    min_stock: 1,
    location,
    printer,
    ink_code: inkCode,
    notes: used ? [`Saat import: ${used}`] : [],
  };
  items.set(key(name), item);
  if (sealed > 0) {
    movements.push({
      item,
      type: "penyesuaian",
      quantity: sealed,
      moved_at: updated,
      notes: "Stok awal dari sheet TINTA PRINTER (Futake)",
      source: `TINTA PRINTER baris ${n}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Laporan
// ---------------------------------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });
const stockOf = (item: Item) => movements.filter((m) => m.item === item).reduce((s, m) => s + m.quantity, 0);
const byCategory = new Map<string, Item[]>();
for (const i of items.values()) byCategory.set(i.category, [...(byCategory.get(i.category) ?? []), i]);
const count = (t: Movement["type"]) => movements.filter((m) => m.type === t).length;

const lines = [
  `# Laporan Import Stok`,
  ``,
  `Dibuat: ${new Date().toLocaleString("id-ID")}`,
  ``,
  `## Ringkasan`,
  ``,
  `- Jenis barang: **${items.size}**`,
  `- Transaksi masuk: **${count("masuk")}**, keluar: **${count("keluar")}**, penyesuaian: **${count("penyesuaian")}**`,
  `- Transaksi keluar yang tujuannya terdeteksi unit bisnisnya: **${movements.filter((m) => m.recipient_unit).length}**`,
  ``,
  `| Kategori | Jenis | Total stok |`,
  `|---|---:|---:|`,
  ...[...byCategory.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([c, list]) => `| ${c} | ${list.length} | ${list.reduce((s, i) => s + stockOf(i), 0)} |`),
  ``,
  `## Perlu dicek: stok Excel berbeda dengan hasil hitung (${review.mismatch.length})`,
  ``,
  ...(review.mismatch.length ? review.mismatch.map((m) => `- ${m}`) : ["- (tidak ada) — semua sisa stok cocok dengan sheet INVENTARIS"]),
  ``,
  `## Perlu dicek: tinta yang tercatat di dua tempat (${review.inkMerged.length})`,
  ``,
  ...review.inkMerged.map((m) => `- ${m}`),
  ``,
  `## Perlu dicek: nama barang tidak ditemukan (${review.unmatched.length})`,
  ``,
  ...(review.unmatched.length ? review.unmatched.map((m) => `- ${m}`) : ["- (tidak ada)"]),
  ``,
  `## Catatan`,
  ``,
  `- ${review.placeholderDates} transaksi keluar bertanggal ${firstOutDate} (kemungkinan tanggal pengisi untuk data lama). Tanggal asli tidak diketahui.`,
  ``,
  `## Daftar Barang`,
  ``,
  `| Kode | Nama | Kategori | Stok | Min |`,
  `|---|---|---|---:|---:|`,
  ...[...items.values()].map((i) => `| ${i.code} | ${i.name} | ${i.category} | ${stockOf(i)} | ${i.min_stock} |`),
];
writeFileSync(join(OUT_DIR, "laporan-stok.md"), lines.join("\n"), "utf8");

console.log(`Barang: ${items.size} | Masuk: ${count("masuk")} | Keluar: ${count("keluar")} | Penyesuaian: ${count("penyesuaian")}`);
console.log(`Perlu dicek → stok beda: ${review.mismatch.length}, tinta dobel: ${review.inkMerged.length}, nama tak dikenal: ${review.unmatched.length}`);
console.log(`Laporan: import-output/laporan-stok.md`);
const negative = [...items.values()].filter((i) => stockOf(i) < 0);
if (negative.length) {
  console.error(`Stok minus: ${negative.map((i) => i.name).join(", ")} — perbaiki Excel dulu.`);
  process.exit(1);
}

if (!COMMIT) {
  console.log(`\nMode cek saja — database tidak diubah. Jalankan "npm run import:stok -- --commit" untuk memasukkan data.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Commit
// ---------------------------------------------------------------------------
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diisi di .env.local");
  process.exit(1);
}
const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

// (bukan HEAD request: error "tabel tidak ada" tidak terbaca pada HEAD)
const { data: existing, error: checkError } = await sb.from("stock_items").select("id").limit(1);
if (checkError) {
  console.error(`Tabel stok belum ada: jalankan dulu supabase/migrations/0002_stock.sql di SQL Editor. (${checkError.message})`);
  process.exit(1);
}
if (existing.length) {
  console.error("Database sudah berisi data barang. Import dibatalkan agar data tidak dobel.");
  process.exit(1);
}

const { data: companies } = await sb.from("companies").select("id, code");
const companyId = new Map((companies ?? []).map((c) => [c.code, c.id]));

async function insert(table: string, data: Record<string, unknown>[]) {
  for (let i = 0; i < data.length; i += 200) {
    const { error } = await sb.from(table).insert(data.slice(i, i + 200));
    if (error) throw new Error(`Gagal insert ${table}: ${error.message}`);
  }
  console.log(`✓ ${table}: ${data.length}`);
}

await insert(
  "stock_items",
  [...items.values()].map((i) => ({
    id: i.id,
    code: i.code,
    name: i.name,
    category: i.category,
    unit: i.unit,
    min_stock: i.min_stock,
    location: i.location ?? null,
    printer: i.printer ?? null,
    ink_code: i.ink_code ?? null,
    notes: i.notes.join("\n") || null,
  })),
);
// Masuk dulu, baru keluar, agar pengecekan "stok tidak boleh minus" tidak gagal di tengah jalan
const ordered = [...movements].sort((a, b) => Number(b.quantity > 0) - Number(a.quantity > 0));
await insert(
  "stock_movements",
  ordered.map((m) => ({
    item_id: m.item.id,
    type: m.type,
    quantity: m.quantity,
    moved_at: m.moved_at,
    unit_price: m.unit_price ?? null,
    warranty: m.warranty ?? null,
    recipient: m.recipient ?? null,
    recipient_company_id: m.recipient_unit ? companyId.get(m.recipient_unit) ?? null : null,
    notes: m.notes ?? null,
  })),
);
console.log("\nImport stok selesai.");
