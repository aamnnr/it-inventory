// Import data inventaris dari file Excel lama (folder Data/) ke Supabase.
//
//   npm run import            → hanya membaca & membuat laporan (tidak mengubah database)
//   npm run import -- --commit → benar-benar memasukkan data ke Supabase
//
// Laporan ditulis ke import-output/laporan-import.md untuk dicek dulu sebelum --commit.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import { CATEGORIES, secretFields, type AssetCategory } from "../src/lib/categories.ts";
import { encryptSecrets } from "../src/lib/secrets.ts";

const ROOT = join(import.meta.dirname, "..");
const DATA_DIR = join(ROOT, "Data");
const OUT_DIR = join(ROOT, "import-output");
const COMMIT = process.argv.includes("--commit");
if (existsSync(join(ROOT, ".env.local"))) process.loadEnvFile(join(ROOT, ".env.local"));

// ---------------------------------------------------------------------------
// Konfigurasi: file → perusahaan, dan ejaan nama yang dianggap orang yang sama
// ---------------------------------------------------------------------------
// Unit bisnis Kembar Futa Group (KFG)
const UNITS: Record<string, string> = {
  FTK: "Futake",
  FTS: "Futastone",
  FTF: "Futafarm",
  ATL: "Ayem Tentrem Logam",
  FTG: "Futago Karya",
  TVL: "Tviling",
};

type FileConfig = {
  match: RegExp;
  /** Unit untuk tiap baris. File gabungan Futastone & Futafarm dipilah dari kolom DEPARTEMEN. */
  unitFor: (row: Row) => string;
  /** true bila unit hasil pemilahan perlu dipastikan manual */
  ambiguous?: boolean;
};

const FILES: FileConfig[] = [
  { match: /FUTAKE/i, unitFor: () => "FTK" },
  {
    match: /FUTASTONE/i,
    unitFor: (row) => (/futafarm/i.test(text(row.get("DEPARTEMEN")) ?? "") ? "FTF" : "FTS"),
    ambiguous: true,
  },
  { match: /Ayem Tentrem/i, unitFor: () => "ATL" },
  { match: /Futago/i, unitFor: () => "FTG" },
  { match: /Tviling/i, unitFor: () => "TVL" },
];

/** Salah ketik nama yang jelas merujuk orang yang sama (per perusahaan). */
const NAME_ALIASES: Record<string, Record<string, string>> = {
  FTK: { bela: "bella", fatkhur: "fathur" },
  FTG: { deny: "deni", fardan: "fardhan", lutfhi: "luthfi" },
  TVL: { faisak: "faisal", rizqy: "rizky" },
};

/** Pemegang yang bukan orang → aset dicatat milik departemen saja. */
const GROUP_HOLDER = /^(all team|marketplace|procurement|security|it support|hrd futago|\(belum ada\)|(laptop|pc)\b.*)$/i;

// ---------------------------------------------------------------------------
// Model hasil parsing
// ---------------------------------------------------------------------------
type Employee = {
  id: string;
  companyCode: string;
  name: string;
  department?: string;
  position?: string;
  status: "aktif" | "pindah" | "resign";
  notes: string[];
};
type Asset = {
  id: string;
  code: string;
  companyCode: string;
  category: AssetCategory;
  name: string;
  serial?: string;
  hostname?: string;
  status: "dipakai" | "tersedia" | "rusak";
  holder?: Employee;
  department?: string;
  location?: string;
  sharedWith: string[];
  purchaseDate?: string;
  purchasePrice?: number;
  lastCleaned?: string;
  specs: Record<string, string>;
  secrets: Record<string, string>;
  notes: string[];
  source: string;
};

const companies = new Map<string, { id: string; code: string; name: string }>();
const departments = new Map<string, { id: string; companyCode: string; name: string }>();
const locations = new Map<string, { id: string; companyCode: string; name: string }>();
const employees = new Map<string, Employee>();
const assets: Asset[] = [];
const counters = new Map<string, number>();
const review = {
  fuzzy: [] as string[],
  movedHolders: [] as string[],
  incomplete: [] as string[],
  unmatchedPic: [] as string[],
  skippedSheets: [] as string[],
  duplicateSerial: [] as string[],
  unitGuess: [] as string[],
};

// ---------------------------------------------------------------------------
// Helper pembersihan nilai sel
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

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Teks bersih; null untuk sel kosong / "-" / template "C: D: E:" yang belum diisi. */
function text(v: Cell): string | undefined {
  const r = raw(v);
  if (r === null || r === undefined || r === false) return undefined;
  if (r === true) return "Ada";
  if (r instanceof Date) return isoDate(r);
  if (typeof r === "number") return Number.isInteger(r) ? String(r) : String(r);
  const s = String(r)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" / ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s || s === "-" || s === "/") return undefined;
  if (/^([CDE]:\s*\/?\s*)+$/i.test(s)) return undefined;
  return s;
}

function num(v: Cell): number | undefined {
  const r = raw(v);
  if (typeof r === "number") return r;
  const s = text(v)?.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = s ? Number(s) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Tanggal dari Date Excel atau teks "dd-mm-yyyy" / "dd-mm-yy". */
function date(v: Cell): string | undefined {
  const r = raw(v);
  if (r instanceof Date) return isoDate(r);
  const m = text(v)?.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (!m) return undefined;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function intText(v: Cell) {
  const r = raw(v);
  return typeof r === "number" ? String(Math.round(r)) : text(v);
}

function joinParts(...parts: (string | undefined)[]) {
  const out = parts.filter(Boolean).join(" ");
  return out || undefined;
}

function normDept(s?: string) {
  if (!s) return undefined;
  return s
    .replace(/[()]/g, "")
    .replace(/\s*-\s*/g, " & ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

// ---------------------------------------------------------------------------
// Pembacaan sheet: header berdasarkan nama kolom, bukan posisi
// ---------------------------------------------------------------------------
type Row = {
  n: number;
  get: (...names: string[]) => Cell;
  /** true bila sel kolom ini lanjutan merge dari baris di atasnya (nilainya ikut terulang) */
  continued: (...names: string[]) => boolean;
  values: Cell[];
};

/** "Type Memory VGA\nIntegrated" dan "NAMA / POSISI" → "TYPE MEMORY VGA INTEGRATED", "NAMA POSISI" */
function normHeader(s: string) {
  return s.replace(/ \/ /g, " ").replace(/\s+/g, " ").trim().toUpperCase();
}

function readSheet(ws: ExcelJS.Worksheet) {
  const headerRow = ws.getRow(1);
  const headers = new Map<string, number>();
  headerRow.eachCell((cell, col) => {
    const h = text(cell.value);
    if (h && !headers.has(normHeader(h))) headers.set(normHeader(h), col);
  });
  const rows: Row[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const values = (row.values as Cell[]).slice(1);
    const cellOf = (names: string[]) => {
      for (const name of names) {
        const col = headers.get(normHeader(name));
        if (col) return row.getCell(col);
      }
      return undefined;
    };
    rows.push({
      n,
      values,
      get: (...names) => cellOf(names)?.value ?? null,
      continued: (...names) => {
        const cell = cellOf(names);
        return !!cell?.isMerged && cell.master.address !== cell.address;
      },
    });
  });
  return { headers, rows };
}

function filled(row: Row) {
  return row.values.map((v) => text(v)).filter((v) => v !== undefined);
}

/**
 * Baris yang hanya berisi teks di kolom A (mis. "MARKETING") = judul bagian/departemen.
 * Sel judul sering di-merge ke kanan; ExcelJS mengulang nilainya di tiap sel merge.
 */
function sectionTitle(row: Row) {
  const vals = new Set(filled(row));
  const a = text(row.values[0]);
  return vals.size === 1 && a && vals.has(a) && a === a.toUpperCase() && !/^\d/.test(a) ? a : undefined;
}

// ---------------------------------------------------------------------------
// Karyawan
// ---------------------------------------------------------------------------
type HolderInfo = { employee?: Employee; group?: string; note?: string };

/** "Fajar\n(Pindah ke Futago)" → nama "Fajar", status pindah. "Mas Syaiful" → "Syaiful". */
function parseHolderText(v: Cell) {
  const r = raw(v);
  if (r === null || r === undefined) return undefined;
  const full = String(r).replace(/\s+/g, " ").trim();
  const lines = String(r).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!full || full === "-") return undefined;
  const parens = [...full.matchAll(/\(([^)]*)\)?/g)].map((m) => m[1].trim());
  let name = lines[0].replace(/\(.*$/, "").trim();
  const extra = lines.slice(1).join(" ").replace(/\(.*?\)/g, "").replace(/\(.*$/, "").trim();
  if (/^\(.*\)$/.test(full)) name = full; // "(Belum Ada)"
  name = name.replace(/^(mas|mba|mbak|pak|bu|ibu|bapak)\s+/i, "").trim();
  let status: Employee["status"] = "aktif";
  const notes: string[] = [];
  for (const p of parens) {
    if (!p || /^\(.*\)$/.test(full)) continue;
    if (/pindah/i.test(p)) status = "pindah";
    if (/resign/i.test(p)) status = "resign";
    notes.push(p);
  }
  if (extra) notes.push(extra);
  return { name, status, notes };
}

function findEmployee(companyCode: string, name: string, context: string): Employee | undefined {
  const key = name.toLowerCase();
  const alias = NAME_ALIASES[companyCode]?.[key];
  const exact = employees.get(`${companyCode}|${alias ?? key}`);
  if (exact) {
    if (alias) review.fuzzy.push(`${companyCode}: "${name}" dianggap sama dengan "${exact.name}" (${context})`);
    return exact;
  }
  // Cocokkan nama depan bila hanya ada satu kandidat (mis. "Rudi" → "Rudi Setiyawan")
  const first = key.split(" ")[0];
  const candidates = [...employees.values()].filter(
    (e) => e.companyCode === companyCode && e.name.toLowerCase().split(" ")[0] === first,
  );
  if (candidates.length === 1) {
    review.fuzzy.push(`${companyCode}: "${name}" dianggap sama dengan "${candidates[0].name}" (${context})`);
    return candidates[0];
  }
  return undefined;
}

function resolveHolder(
  companyCode: string,
  cell: Cell,
  opts: { department?: string; position?: string; create: boolean; context: string },
): HolderInfo {
  const parsed = parseHolderText(cell);
  if (!parsed) return {};
  if (GROUP_HOLDER.test(parsed.name)) return { group: parsed.name };

  let emp = findEmployee(companyCode, parsed.name, opts.context);
  if (!emp) {
    if (!opts.create) {
      review.unmatchedPic.push(`${companyCode}: PIC "${text(cell)}" tidak ditemukan di data karyawan (${opts.context})`);
      return { note: `PIC: ${text(cell)}` };
    }
    // Simpan dengan ejaan baku bila nama ini salah ketik yang terdaftar di NAME_ALIASES
    const alias = NAME_ALIASES[companyCode]?.[parsed.name.toLowerCase()];
    const name = alias ? alias.replace(/\b\w/g, (c) => c.toUpperCase()) : parsed.name;
    if (alias) review.fuzzy.push(`${companyCode}: "${parsed.name}" dicatat sebagai "${name}" (${opts.context})`);
    emp = {
      id: randomUUID(),
      companyCode,
      name,
      department: opts.department,
      position: opts.position,
      status: "aktif",
      notes: [],
    };
    employees.set(`${companyCode}|${name.toLowerCase()}`, emp);
  }
  emp.department ??= opts.department;
  emp.position ??= opts.position;
  if (parsed.status !== "aktif") emp.status = parsed.status;
  for (const n of parsed.notes) if (!emp.notes.includes(n)) emp.notes.push(n);
  if (emp.department) ensureDepartment(companyCode, emp.department);
  return { employee: emp };
}

function ensureDepartment(companyCode: string, name?: string) {
  if (!name) return undefined;
  const key = `${companyCode}|${name}`;
  if (!departments.has(key)) departments.set(key, { id: randomUUID(), companyCode, name });
  return name;
}

function ensureLocation(companyCode: string, name?: string) {
  if (!name) return undefined;
  const key = `${companyCode}|${name.toLowerCase()}`;
  if (!locations.has(key)) locations.set(key, { id: randomUUID(), companyCode, name });
  return locations.get(key)!.name;
}

// ---------------------------------------------------------------------------
// Aset
// ---------------------------------------------------------------------------
function nextCode(companyCode: string, category: AssetCategory) {
  const prefix = CATEGORIES[category].prefix;
  const key = `${companyCode}-${prefix}`;
  const n = (counters.get(key) ?? 0) + 1;
  counters.set(key, n);
  return `${key}-${String(n).padStart(3, "0")}`;
}

function clean<T extends Record<string, string | undefined>>(o: T) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Record<string, string>;
}

function addAsset(
  companyCode: string,
  category: AssetCategory,
  data: Partial<Omit<Asset, "id" | "code" | "companyCode" | "category" | "specs">> & {
    name: string;
    source: string;
    specs?: Record<string, string | undefined>;
  },
  holder: HolderInfo,
  department?: string,
) {
  const specs = clean(data.specs ?? {});
  const secretKeys = new Set(secretFields(category).map((f) => f.key));
  const secrets: Record<string, string> = {};
  for (const [k, v] of Object.entries(specs)) {
    if (secretKeys.has(k)) {
      secrets[k] = v;
      delete specs[k];
    }
  }
  const dept = holder.employee?.department ?? department;
  ensureDepartment(companyCode, dept);
  const notes = [...(data.notes ?? [])];
  if (holder.group) notes.unshift(`Dipakai oleh: ${holder.group}`);
  if (holder.note) notes.unshift(holder.note);
  const asset: Asset = {
    id: randomUUID(),
    code: nextCode(companyCode, category),
    companyCode,
    category,
    sharedWith: [],
    ...data,
    status: data.status ?? (holder.employee || holder.group ? "dipakai" : "tersedia"),
    holder: holder.employee,
    department: dept,
    specs,
    secrets,
    notes,
  };
  if (holder.group && /belum ada/i.test(holder.group)) asset.status = "tersedia";
  assets.push(asset);
  if (holder.employee && holder.employee.status !== "aktif") {
    review.movedHolders.push(
      `${asset.code} (${asset.name}) dipegang ${holder.employee.name} yang berstatus ${holder.employee.status}` +
        (holder.employee.notes.length ? ` — "${holder.employee.notes.join("; ")}"` : "") +
        ". Cek apakah aset sudah dikembalikan / ikut pindah.",
    );
  }
  return asset;
}

// ---------------------------------------------------------------------------
// Parser per jenis sheet
// ---------------------------------------------------------------------------
type Ctx = { file: string; sheet: string; companyFor: (row: Row) => string };

function src(ctx: Ctx, row: Row) {
  return `${ctx.file} › ${ctx.sheet} › baris ${row.n}`;
}

function parseComputers(ctx: Ctx, ws: ExcelJS.Worksheet) {
  const { rows } = readSheet(ws);
  let section: string | undefined;
  for (const row of rows) {
    const code = ctx.companyFor(row);
    const title = sectionTitle(row);
    if (title) {
      section = normDept(title);
      continue;
    }
    if (!text(row.get("NAMA PIC"))) continue;
    const g = (...n: string[]) => text(row.get(...n));

    const jenis = g("JENIS & MEREK", "TIPE") ?? "";
    let hostname = g("HOSTNAME");
    const isLaptop = /^laptop/i.test(jenis) || /^laptop/i.test(hostname ?? "");
    const model = jenis.replace(/^(laptop|pc|cpu)\s*\/?\s*/i, "").trim() || undefined;
    if (hostname && /^(laptop|desktop)$/i.test(hostname)) hostname = undefined;

    const department = normDept(g("DEPARTEMEN")) ?? section;
    const position = g("POSISI");
    const holder = resolveHolder(code, row.get("NAMA PIC"), {
      department,
      position,
      create: true,
      context: `${ctx.sheet} baris ${row.n}`,
    });

    // Baris sederhana hanya mengisi "SLOT RAM 1" sebagai total RAM; baris lengkap mengisi per keping + merek
    const ramSizes = [1, 2, 3].map((i) => g(`SLOT RAM ${i}`)).filter(Boolean);
    const ramBrands = [1, 2, 3].map((i) =>
      [g(`MODULE MANUFAKTUR ${i}`), g(`DRAM MANUFAKTUR ${i}`)].filter(Boolean).join(" / "),
    );
    const ramSlots = ramBrands.some(Boolean)
      ? [1, 2, 3]
          .filter((i) => g(`SLOT RAM ${i}`))
          .map((i) => `Slot ${i}: ${g(`SLOT RAM ${i}`)}${ramBrands[i - 1] ? ` (${ramBrands[i - 1]})` : ""}`)
      : [];
    const storageDetail = [
      g("MEREK STORAGE") && `Merek: ${g("MEREK STORAGE")}`,
      g("KESEHATAN STORAGE") && `Kesehatan: ${g("KESEHATAN STORAGE")}`,
      g("READ MB/S STORAGE") && `Read: ${g("READ MB/S STORAGE")} MB/s`,
      g("WRITE MB/S STORAGE") && `Write: ${g("WRITE MB/S STORAGE")} MB/s`,
    ].filter(Boolean);
    const vgaMem = (type?: string, mem?: string) => [type, mem].filter(Boolean).join(" ");
    const vga = (name?: string, extra?: string) =>
      name && extra && name.replace(/\s/g, "").includes(extra.replace(/\s/g, "")) ? name : joinParts(name, extra || undefined);
    const slots = [
      g("SLOT RAM") && `RAM ${g("SLOT RAM")}`,
      g("SLOT M.2") && `M.2 ${g("SLOT M.2")}`,
      g("SLOT SATA") && `SATA ${g("SLOT SATA")}`,
    ].filter(Boolean);

    const specs = {
      processor: g("PROCESSOR"),
      cpu_speed: g("BASE SPEED CPU"),
      cpu_cores: joinParts(g("CORE") && `${g("CORE")} core`, g("THREAD") && `/ ${g("THREAD")} thread`),
      cpu_socket: g("SOCKET PROCESSOR"),
      cpu_temp_idle: g("SUHU CPU IDLE") && `${g("SUHU CPU IDLE")}°C`,
      motherboard: joinParts(g("MEREK MOBO"), g("MODEL MOBO")),
      board_slots: slots.join(", ") || undefined,
      ram: joinParts(ramSizes.join(" + ") || g("RAM"), g("GENERASI RAM"), g("KECEPATAN MAX MEMORY")),
      ram_detail: ramSlots.join("\n") || undefined,
      storage: g("STORAGE", "MEMORY"),
      storage_detail: storageDetail.join("\n") || undefined,
      vga_integrated: vga(g("VGA INTEGRATED"), vgaMem(g("TYPE MEMORY VGA INTEGRATED"), g("MEMORY VGA INTEGRATED"))),
      vga_dedicated: vga(g("VGA DEDICATED", "VGA"), vgaMem(g("TYPE MEMORY VGA DEDICATED"), g("MEMORY VGA DEDICATED"))),
      psu: joinParts(g("MEREK PSU"), g("WATT PSU")),
      os: g("SISTEM OPERASI"),
      software: g("SOFTWARE WAJIB"),
      monitor: g("MONITOR"),
      keyboard: g("KEYBOARD"),
      mouse: g("MOUSE"),
      wifi_dongle: g("DONGLE WIFI"),
      accessories: g("LAIN-LAIN"),
      issues_software: g("KENDALA SOFTWARE"),
      issues_hardware: g("KENDALA HARDWARE"),
    };
    const category: AssetCategory = isLaptop ? "laptop" : "pc";
    const asset = addAsset(
      code,
      category,
      {
        name: model ?? (isLaptop ? "Laptop" : "PC Desktop"),
        hostname,
        lastCleaned: date(row.get("DIBERSIHKAN PADA")),
        purchasePrice: num(row.get("HARGA")),
        purchaseDate: date(row.get("TANGGAL BELI")),
        specs,
        notes: [g("KETERANGAN")].filter(Boolean) as string[],
        source: src(ctx, row),
      },
      holder,
      department,
    );
    if (!specs.processor && !specs.ram && !specs.storage && !model) {
      review.incomplete.push(`${asset.code} — ${holder.employee?.name ?? holder.group ?? "?"}: spesifikasi belum diisi`);
    }
  }
}

function parsePhones(ctx: Ctx, ws: ExcelJS.Worksheet) {
  const { rows } = readSheet(ws);
  let section: string | undefined;
  for (const row of rows) {
    const code = ctx.companyFor(row);
    const title = sectionTitle(row);
    if (title) {
      section = normDept(title);
      continue;
    }
    if (!text(row.get("NAMA PIC"))) continue;
    const g = (...n: string[]) => text(row.get(...n));
    const department = section ?? normDept(g("DEPARTEMEN"));
    const holder = resolveHolder(code, row.get("NAMA PIC"), {
      department,
      position: g("POSISI"),
      create: true,
      context: `${ctx.sheet} baris ${row.n}`,
    });
    const model = joinParts(g("MEREK HP", "TIPE"), g("VARIAN"));
    const category: AssetCategory = /^(ht|telfon|telepon)\b/i.test(model ?? "") ? "lainnya" : "handphone";
    const service = [g("SERVICE")].filter(Boolean).join("\n") || undefined;
    const asset = addAsset(
      code,
      category,
      {
        name: model ?? "Handphone (merek belum diisi)",
        hostname: g("HOSTNAME"),
        lastCleaned: date(row.get("DIBERSIHKAN PADA")),
        purchasePrice: num(row.get("HARGA", "HARGA BELI")),
        purchaseDate: date(row.get("TANGGAL BELI")),
        specs:
          category === "handphone"
            ? {
                phone_number: g("NOMOR TERKAIT"),
                email: g("EMAIL"),
                processor: g("PROCESSOR"),
                ram: g("RAM") && (/^\d+$/.test(g("RAM")!) ? `${g("RAM")}GB` : g("RAM")),
                rom: g("ROM") && (/^\d+$/.test(g("ROM")!) ? `${g("ROM")}GB` : g("ROM")),
                battery: joinParts(g("BATERAI"), g("KESEHATAN BATERAI")),
                charger: g("CHARGER"),
                tempered_glass: g("TEMPERED GLASS", "TEMPER GLASS"),
                casing: g("CASING"),
                accessories: g("KELENGKAP", "KELENGKAPAN"),
                service,
              }
            : {},
        notes: [],
        source: src(ctx, row),
      },
      holder,
      department,
    );
    if (!model) review.incomplete.push(`${asset.code} — ${holder.employee?.name ?? holder.group ?? "?"}: merek/tipe HP belum diisi`);
  }
}

function parseSimCards(ctx: Ctx, ws: ExcelJS.Worksheet) {
  const { rows } = readSheet(ws);
  for (const row of rows) {
    const code = ctx.companyFor(row);
    if (!text(row.get("NAMA PIC"))) continue;
    const g = (...n: string[]) => text(row.get(...n));
    const number = g("NOMOR", "DETAIL");
    const provider = g("MEREK KARTU");
    const holder = resolveHolder(code, row.get("NAMA PIC"), {
      department: normDept(g("DEPARTEMEN")),
      position: g("POSISI"),
      create: true,
      context: `${ctx.sheet} baris ${row.n}`,
    });
    addAsset(
      code,
      "simcard",
      {
        name: joinParts(provider, number) ?? "SIM Card",
        specs: {
          phone_number: number,
          provider,
          device: g("MEREK HP", "HANDPHONE"),
          purpose: g("PENGGUNA"),
          active_until: date(row.get("MASA AKTIF")) ?? g("MASA AKTIF"),
          balance: intText(row.get("PULSA")),
          activation_method: g("METODE AKTIVASI"),
          nik: intText(row.get("NIK")),
          kk: intText(row.get("KK")),
          sim_digits: intText(row.get("6 DIGIT AKHIR NOMOR SIM")),
        },
        notes: [g("STATUS") && `Status: ${g("STATUS")}`, g("FILE BACKUP (GB)") && `Backup: ${g("FILE BACKUP (GB)")} GB`].filter(
          Boolean,
        ) as string[],
        source: src(ctx, row),
      },
      holder,
      normDept(g("DEPARTEMEN")),
    );
  }
}

function parseUps(ctx: Ctx, ws: ExcelJS.Worksheet) {
  const { headers, rows } = readSheet(ws);
  // Format sederhana: kolom NO (atau "NAMA PIC" berisi nomor) + PENGGUNA/NAMA.
  // Baris tanpa nomor = pemakai tambahan UPS di atasnya (dipakai bersama).
  const simple = headers.has("NO") || headers.has("NAMA");
  let section: string | undefined;
  let last: Asset | undefined;
  for (const row of rows) {
    const code = ctx.companyFor(row);
    const title = sectionTitle(row);
    if (title) {
      section = normDept(title);
      last = undefined;
      continue;
    }
    const g = (...n: string[]) => text(row.get(...n));
    const nameCell = simple ? row.get("PENGGUNA", "NAMA") : row.get("NAMA PIC");
    const nameText = text(nameCell);
    if (!nameText || /^(nama|pengguna)$/i.test(nameText)) continue;
    const numbered = simple ? !!g("NO", "NAMA PIC") && !row.continued("NO", "NAMA PIC") : true;
    if (!numbered && last) {
      const extra = resolveHolder(code, nameCell, {
        department: section,
        position: g("POSISI"),
        create: true,
        context: `${ctx.sheet} baris ${row.n}`,
      });
      last.sharedWith.push(extra.employee?.name ?? extra.group ?? nameText);
      continue;
    }
    const department = normDept(g("DEPARTEMEN")) ?? section;
    const holder = resolveHolder(code, nameCell, {
      department,
      position: g("POSISI"),
      create: true,
      context: `${ctx.sheet} baris ${row.n}`,
    });
    const brand = g("MEREK UPS", "MEREK");
    const issues = g("KENDALA");
    const size = simple ? g("TIPE") : undefined;
    const model = simple ? undefined : g("TIPE");
    last = addAsset(
      code,
      "ups",
      {
        name: joinParts("UPS", brand, model) ?? "UPS",
        status: issues && /rusak/i.test(issues) ? "rusak" : undefined,
        specs: {
          model,
          size,
          capacity: g("POWER / DAYA", "POWER DAYA"),
          outlets: g("COLOKAN"),
          issues,
        },
        notes: [],
        source: src(ctx, row),
      },
      holder,
      department,
    );
  }
}

function parsePrinters(ctx: Ctx, ws: ExcelJS.Worksheet) {
  const { headers, rows } = readSheet(ws);
  const detailed = headers.has("LOKASI"); // format Futake
  let section: string | undefined;
  let last: Asset | undefined;
  for (const row of rows) {
    const code = ctx.companyFor(row);
    const title = sectionTitle(row);
    if (title) {
      section = normDept(title);
      last = undefined;
      continue;
    }
    const g = (...n: string[]) => text(row.get(...n));
    if (detailed) {
      const model = g("MEREK");
      if (!model) continue;
      const holder = resolveHolder(code, row.get("PIC"), {
        create: false,
        context: `${ctx.sheet} baris ${row.n}`,
      });
      const service = [
        g("SERVICE ROLLER") && `Service roller: ${g("SERVICE ROLLER")}`,
        g("SERVICE PEMBUANGAN TINTA") && `Service pembuangan tinta: ${g("SERVICE PEMBUANGAN TINTA")}`,
        g("SERVICE") && `Service: ${g("SERVICE")}`,
      ].filter(Boolean);
      addAsset(
        code,
        "printer",
        {
          name: model,
          location: ensureLocation(code, g("LOKASI")),
          purchaseDate: date(row.get("TANGGAL BELI")),
          specs: {
            ink_code: g("KODE TINTA"),
            access: g("AKSES VIA"),
            server_hostname: g("HOSTNAME PC SERVER"),
            total_print: g("TOTAL PRINT X"),
            service: service.join("\n") || undefined,
            issues: g("KENDALA"),
          },
          notes: [],
          source: src(ctx, row),
        },
        holder,
      );
      continue;
    }
    const nameText = g("NAMA PIC");
    if (!nameText || /^nama pic$/i.test(nameText)) continue;
    const model = row.continued("TIPE") ? undefined : g("TIPE");
    const department = normDept(g("DEPARTEMEN")) ?? section;
    if (!model && last) {
      const extra = resolveHolder(code, row.get("NAMA PIC"), {
        department: section,
        position: g("POSISI"),
        create: true,
        context: `${ctx.sheet} baris ${row.n}`,
      });
      last.sharedWith.push(extra.employee?.name ?? extra.group ?? nameText);
      continue;
    }
    if (!model) continue;
    const holder = resolveHolder(code, row.get("NAMA PIC"), {
      department,
      position: g("POSISI"),
      create: true,
      context: `${ctx.sheet} baris ${row.n}`,
    });
    last = addAsset(
      code,
      "printer",
      {
        name: model,
        specs: { issues: g("KETERANGAN") },
        notes: [g("STATUS") && `Status: ${g("STATUS")}`].filter(Boolean) as string[],
        source: src(ctx, row),
      },
      holder,
      department,
    );
  }
}

function parseCctv(ctx: Ctx, ws: ExcelJS.Worksheet) {
  const { rows } = readSheet(ws);
  const seen = new Map<string, string>();
  for (const row of rows) {
    const code = ctx.companyFor(row);
    const g = (...n: string[]) => text(row.get(...n));
    const model = g("MEREK & TIPE", "NAMA BARANG");
    if (!model) continue;
    const serial = g("NOMOR SERI / SN", "NOMOR SERI SN");
    const asset = addAsset(
      code,
      "cctv",
      {
        name: model,
        serial,
        status: "dipakai",
        location: ensureLocation(code, g("NAMA / POSISI", "NAMA POSISI")),
        specs: {
          connection: g("JALUR"),
          verification_code: g("KODE VERIFIKASI"),
          nvr_password: g("PASSWORD NVR"),
        },
        notes: [g("KETERANGAN")].filter(Boolean) as string[],
        source: src(ctx, row),
      },
      {},
    );
    if (serial) {
      if (seen.has(serial)) review.duplicateSerial.push(`SN ${serial} dipakai ${seen.get(serial)} dan ${asset.code} (${asset.location})`);
      else seen.set(serial, `${asset.code} (${asset.location})`);
    }
  }
}

// Urutan penting: sheet komputer dulu karena departemennya paling rapi
const SHEET_TYPES: { match: RegExp; parse: (ctx: Ctx, ws: ExcelJS.Worksheet) => void }[] = [
  { match: /^laptop\s*pc(\s*monitor)?(\s*kantor)?$/i, parse: parseComputers },
  { match: /^ups$/i, parse: parseUps },
  { match: /^handphone/i, parse: parsePhones },
  { match: /^sim\s*card$/i, parse: parseSimCards },
  { match: /^printer$/i, parse: parsePrinters },
  { match: /^cctv$/i, parse: parseCctv },
];

const LATER_PHASE: Record<string, string> = {
  "TINTA PRINTER": "stok tinta → Fase 2",
  INVENTARIS: "stok barang → Fase 2",
  PEMBELIAN_IN: "stok barang masuk → Fase 2",
  PEMAKAIAN_OUT: "stok barang keluar → Fase 2",
  "LANGGANAN IT SUPPORT": "langganan & lisensi → Fase 3",
  "LAPTOP PRIBADI": "perbaikan laptop pribadi → Fase 3",
  "LAPTOPPC PRIBADI": "perbaikan laptop pribadi → Fase 3",
  "JADWAL MAINTENANCE": "jadwal maintenance → Fase 3",
  "PIVOT LAPTOP PRIBADI": "pivot otomatis, tidak perlu diimport",
};

// ---------------------------------------------------------------------------
// Jalankan parsing
// ---------------------------------------------------------------------------
const files = readdirSync(DATA_DIR).filter((f) => f.toLowerCase().endsWith(".xlsx") && !f.startsWith("~$"));
for (const file of files) {
  const company = FILES.find((f) => f.match.test(file));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(join(DATA_DIR, file));
  if (!company) {
    for (const ws of wb.worksheets) {
      const why = LATER_PHASE[ws.name.trim().toUpperCase()] ?? "tidak dikenali";
      review.skippedSheets.push(`${file} › ${ws.name}: ${why}`);
    }
    continue;
  }
  const sheets = [...wb.worksheets].sort((a, b) => {
    const ia = SHEET_TYPES.findIndex((t) => t.match.test(a.name.trim()));
    const ib = SHEET_TYPES.findIndex((t) => t.match.test(b.name.trim()));
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  for (const ws of sheets) {
    const type = SHEET_TYPES.find((t) => t.match.test(ws.name.trim()));
    if (!type) {
      const why = LATER_PHASE[ws.name.trim().toUpperCase()] ?? "tidak dikenali";
      review.skippedSheets.push(`${file} › ${ws.name}: ${why}`);
      continue;
    }
    const sheet = ws.name.trim();
    type.parse(
      {
        file,
        sheet,
        companyFor: (row) => {
          const code = company.unitFor(row);
          if (!companies.has(code)) companies.set(code, { id: randomUUID(), code, name: UNITS[code] });
          if (company.ambiguous && filled(row).length > 1) {
            review.unitGuess.push(`${sheet} baris ${row.n} (${text(row.values[0]) ?? "-"}) → ${UNITS[code]}`);
          }
          return code;
        },
      },
      ws,
    );
  }
}

// Nama yang muncul di lebih dari satu perusahaan (kemungkinan orang yang sama / pindah)
const byName = new Map<string, Employee[]>();
for (const e of employees.values()) {
  const k = e.name.toLowerCase();
  byName.set(k, [...(byName.get(k) ?? []), e]);
}
const crossCompany = [...byName.values()]
  .filter((list) => new Set(list.map((e) => e.companyCode)).size > 1)
  .map((list) => `${list[0].name}: ${list.map((e) => `${e.companyCode} (${e.status})`).join(", ")}`);

// ---------------------------------------------------------------------------
// Laporan
// ---------------------------------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });
const catKeys = Object.keys(CATEGORIES) as AssetCategory[];
const lines: string[] = [];
lines.push(`# Laporan Import Data Inventaris`, ``, `Dibuat: ${new Date().toLocaleString("id-ID")}`, ``);
lines.push(`## Ringkasan`, ``);
lines.push(`| Perusahaan | ${catKeys.map((c) => CATEGORIES[c].label).join(" | ")} | Total |`);
lines.push(`|---|${catKeys.map(() => "---:").join("|")}|---:|`);
for (const c of companies.values()) {
  const mine = assets.filter((a) => a.companyCode === c.code);
  lines.push(`| ${c.name} (${c.code}) | ${catKeys.map((k) => mine.filter((a) => a.category === k).length).join(" | ")} | ${mine.length} |`);
}
lines.push(``, `- Karyawan: **${employees.size}**`, `- Departemen: **${departments.size}**`, `- Lokasi: **${locations.size}**`, `- Aset: **${assets.length}**`);
lines.push(`- Aset dengan data sensitif (terenkripsi): **${assets.filter((a) => Object.keys(a.secrets).length).length}**`, ``);

const section = (title: string, items: string[], hint?: string) => {
  lines.push(`## ${title} (${items.length})`, ``);
  if (hint) lines.push(`_${hint}_`, ``);
  lines.push(...(items.length ? items.map((i) => `- ${i}`) : ["- (tidak ada)"]), ``);
};
section(
  "Perlu dicek: unit Futastone / Futafarm",
  review.unitGuess,
  'File Futastone & Futafarm digabung. Baris dengan departemen "(Futafarm)" → Futafarm, sisanya → Futastone. Ubah unit di aplikasi bila salah.',
);
section("Perlu dicek: pemegang sudah pindah/resign", review.movedHolders, "Setelah import, lakukan serah terima atau pengembalian di aplikasi.");
section("Perlu dicek: nama dicocokkan otomatis", review.fuzzy, "Ubah NAME_ALIASES di scripts/import-excel.mts bila ada yang salah.");
section("Perlu dicek: nama sama di beberapa perusahaan", crossCompany, "Kemungkinan orang yang sama (pindah perusahaan). Saat ini dicatat terpisah per perusahaan.");
section("Perlu dicek: PIC printer tidak ditemukan", review.unmatchedPic);
section("Perlu dicek: nomor seri ganda", review.duplicateSerial);
section("Data belum lengkap", review.incomplete);
section("Sheet yang dilewati", review.skippedSheets);
section(
  "Aset dipakai bersama",
  assets.filter((a) => a.sharedWith.length).map((a) => `${a.code} ${a.name}: ${[a.holder?.name, ...a.sharedWith].filter(Boolean).join(", ")}`),
);

lines.push(`## Daftar Aset`, ``, `| Kode | Kategori | Nama | Pemegang | Departemen | Status | Sumber |`, `|---|---|---|---|---|---|---|`);
for (const a of assets) {
  const holder = a.holder?.name ?? a.notes.find((n) => n.startsWith("Dipakai oleh"))?.replace("Dipakai oleh: ", "") ?? "-";
  lines.push(`| ${a.code} | ${CATEGORIES[a.category].label} | ${a.name} | ${holder} | ${a.department ?? "-"} | ${a.status} | ${a.source} |`);
}
writeFileSync(join(OUT_DIR, "laporan-import.md"), lines.join("\n"), "utf8");
// Pratinjau lengkap untuk dicek; data sensitif disamarkan
writeFileSync(
  join(OUT_DIR, "pratinjau.json"),
  JSON.stringify(
    assets.map(({ holder, secrets, ...a }) => ({
      ...a,
      holder: holder?.name,
      secrets: Object.fromEntries(Object.keys(secrets).map((k) => [k, "••••"])),
    })),
    null,
    2,
  ),
  "utf8",
);

console.log(`Perusahaan: ${companies.size} | Karyawan: ${employees.size} | Departemen: ${departments.size} | Lokasi: ${locations.size} | Aset: ${assets.length}`);
console.log(
  `Perlu dicek → pindah/resign: ${review.movedHolders.length}, nama dicocokkan: ${review.fuzzy.length}, ` +
    `nama lintas perusahaan: ${crossCompany.length}, PIC tak ditemukan: ${review.unmatchedPic.length}, SN ganda: ${review.duplicateSerial.length}`,
);
console.log(`Laporan: import-output/laporan-import.md`);

if (!COMMIT) {
  console.log(`\nMode cek saja — database tidak diubah. Jalankan "npm run import -- --commit" untuk memasukkan data.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Commit ke Supabase (pakai service role key, melewati RLS)
// ---------------------------------------------------------------------------
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diisi di .env.local");
  process.exit(1);
}
const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

const { count } = await sb.from("assets").select("id", { count: "exact", head: true });
if (count) {
  console.error(`Database sudah berisi ${count} aset. Import dibatalkan agar data tidak dobel.`);
  process.exit(1);
}

async function insert(table: string, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb.from(table).insert(rows.slice(i, i + 200));
    if (error) throw new Error(`Gagal insert ${table}: ${error.message}`);
  }
  console.log(`✓ ${table}: ${rows.length}`);
}

const companyId = (code: string) => companies.get(code)!.id;
const deptId = (code: string, name?: string) => (name ? departments.get(`${code}|${name}`)?.id : undefined) ?? null;
const locId = (code: string, name?: string) => (name ? locations.get(`${code}|${name.toLowerCase()}`)?.id : undefined) ?? null;
const today = new Date().toISOString().slice(0, 10);

await insert("companies", [...companies.values()].map((c) => ({ id: c.id, code: c.code, name: c.name })));
await insert("departments", [...departments.values()].map((d) => ({ id: d.id, company_id: companyId(d.companyCode), name: d.name })));
await insert("locations", [...locations.values()].map((l) => ({ id: l.id, company_id: companyId(l.companyCode), name: l.name })));
await insert(
  "employees",
  [...employees.values()].map((e) => ({
    id: e.id,
    company_id: companyId(e.companyCode),
    department_id: deptId(e.companyCode, e.department),
    name: e.name,
    position: e.position ?? null,
    status: e.status,
    notes: e.notes.join("; ") || null,
  })),
);
await insert(
  "assets",
  assets.map((a) => ({
    id: a.id,
    code: a.code,
    company_id: companyId(a.companyCode),
    category: a.category,
    name: a.name,
    serial_number: a.serial ?? null,
    hostname: a.hostname ?? null,
    status: a.status,
    holder_employee_id: a.holder?.id ?? null,
    department_id: deptId(a.companyCode, a.department),
    location_id: locId(a.companyCode, a.location),
    shared_with: a.sharedWith.join(", ") || null,
    purchase_date: a.purchaseDate ?? null,
    purchase_price: a.purchasePrice ?? null,
    last_cleaned_at: a.lastCleaned ?? null,
    specs: a.specs,
    notes: a.notes.join("\n") || null,
  })),
);
await insert(
  "asset_assignments",
  assets
    .filter((a) => a.holder || (a.status === "dipakai" && a.department))
    .map((a) => ({
      asset_id: a.id,
      employee_id: a.holder?.id ?? null,
      department_id: deptId(a.companyCode, a.department),
      assigned_at: today,
      notes: "Data awal dari import Excel",
    })),
);
await insert(
  "asset_secrets",
  assets.filter((a) => Object.keys(a.secrets).length).map((a) => ({ asset_id: a.id, ciphertext: encryptSecrets(a.secrets) })),
);
console.log("\nImport selesai.");
