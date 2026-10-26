// Uji migrasi SQL secara lokal memakai PGlite (Postgres di dalam Node),
// dengan tiruan minimal skema `auth` milik Supabase. Jalankan: npm run test:db
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();

await db.exec(`
  create role authenticated nologin;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;
`);

const dir = join(import.meta.dirname, "..", "supabase", "migrations");
for (const file of readdirSync(dir).sort()) {
  await db.exec(readFileSync(join(dir, file), "utf8"));
  console.log("✓ migrasi", file);
}
await db.exec(`
  grant usage on schema public to authenticated;
  grant all on all tables in schema public to authenticated;
  grant all on all sequences in schema public to authenticated;
`);

let failures = 0;
function check(label: string, ok: boolean) {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failures++;
}
async function asUser(id: string | null, sql: string, params: unknown[] = []) {
  await db.exec(id ? `set role authenticated; set request.jwt.claim.sub = '${id}';` : "reset role;");
  try {
    return await db.query<Record<string, unknown>>(sql, params);
  } finally {
    await db.exec("reset role;");
  }
}
async function fails(fn: () => Promise<unknown>) {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}

const admin = (await db.query<{ id: string }>(`insert into auth.users (email) values ('admin@x.id') returning id`)).rows[0].id;
const viewer = (await db.query<{ id: string }>(`insert into auth.users (email) values ('viewer@x.id') returning id`)).rows[0].id;
const roles = (await db.query<{ role: string }>(`select role from profiles order by created_at, role`)).rows.map((r) => r.role);
check("pengguna pertama admin, berikutnya viewer", roles.includes("admin") && roles.includes("viewer"));

const company = (await asUser(admin, `insert into companies (code, name) values ('FTK', 'Futake') returning id`)).rows[0].id as string;
check("admin bisa menambah perusahaan", !!company);
check("viewer tidak bisa menambah perusahaan", await fails(() => asUser(viewer, `insert into companies (code, name) values ('X', 'X')`)));
check("viewer bisa melihat perusahaan", (await asUser(viewer, `select * from companies`)).rows.length === 1);

const dept = (await asUser(admin, `insert into departments (company_id, name) values ($1, 'SALES') returning id`, [company])).rows[0].id;
const emp = (await asUser(admin, `insert into employees (company_id, department_id, name) values ($1, $2, 'Anis') returning id`, [company, dept])).rows[0].id;
const emp2 = (await asUser(admin, `insert into employees (company_id, name) values ($1, 'Puput') returning id`, [company])).rows[0].id;

const code1 = (await asUser(admin, `select next_asset_code('FTK', 'PC') as c`)).rows[0].c;
check(`kode aset pertama FTK-PC-001 (dapat ${code1})`, code1 === "FTK-PC-001");
const asset = (await asUser(admin, `insert into assets (code, company_id, category, name) values ($1, $2, 'pc', 'PC Rakitan') returning id`, [code1, company])).rows[0].id;
const code2 = (await asUser(admin, `select next_asset_code('FTK', 'PC') as c`)).rows[0].c;
check(`kode aset berikutnya FTK-PC-002 (dapat ${code2})`, code2 === "FTK-PC-002");

await asUser(admin, `select assign_asset($1, $2, null, '2026-01-10', 'serah awal')`, [asset, emp]);
let a = (await asUser(admin, `select status, holder_employee_id, department_id from assets where id = $1`, [asset])).rows[0];
check("serah terima: status dipakai & pemegang terisi", a.status === "dipakai" && a.holder_employee_id === emp && a.department_id === dept);

await asUser(admin, `select assign_asset($1, $2, null, '2026-03-01', 'pindah tangan')`, [asset, emp2]);
const hist = (await asUser(admin, `select employee_id, returned_at from asset_assignments where asset_id = $1 order by assigned_at`, [asset])).rows;
check("pindah tangan menutup riwayat lama & membuka yang baru", hist.length === 2 && hist[0].returned_at !== null && hist[1].returned_at === null);

check("viewer tidak bisa serah terima", await fails(() => asUser(viewer, `select assign_asset($1, $2, null, '2026-03-02', null)`, [asset, emp])));

await asUser(admin, `select return_asset($1, '2026-04-01', 'rusak', 'layar mati')`, [asset]);
a = (await asUser(admin, `select status, holder_employee_id from assets where id = $1`, [asset])).rows[0];
check("pengembalian: pemegang kosong & status rusak", a.status === "rusak" && a.holder_employee_id === null);

await asUser(admin, `insert into asset_secrets (asset_id, ciphertext) values ($1, 'rahasia')`, [asset]);
check("viewer tidak bisa membaca data sensitif", (await asUser(viewer, `select * from asset_secrets`)).rows.length === 0);
check("admin bisa membaca data sensitif", (await asUser(admin, `select * from asset_secrets`)).rows.length === 1);

const logs = (await asUser(admin, `select table_name, action, changes from activity_log`)).rows;
check("log aktivitas tercatat", logs.length > 0);
check("log data sensitif tanpa isi", logs.filter((l) => l.table_name === "asset_secrets").every((l) => l.changes === null));
const upd = logs.find((l) => l.table_name === "assets" && l.action === "UPDATE");
check("log UPDATE hanya menyimpan kolom yang berubah", !!upd && !("name" in (upd.changes as object)));
check("viewer tidak bisa membaca log", (await asUser(viewer, `select * from activity_log`)).rows.length === 0);

// ---------- Fase 2: stok ----------
const itemCode = (await asUser(admin, `select next_item_code() as c`)).rows[0].c;
check(`kode barang pertama INV001 (dapat ${itemCode})`, itemCode === "INV001");
const item = (await asUser(admin, `insert into stock_items (code, name, category, min_stock) values ($1, 'Mouse Logitech B100', 'Aksesoris', 3) returning id`, [itemCode])).rows[0].id;
check("viewer tidak bisa menambah barang", await fails(() => asUser(viewer, `insert into stock_items (code, name) values ('INV999', 'X')`)));

await asUser(admin, `insert into stock_movements (item_id, type, quantity, unit_price, moved_at) values ($1, 'masuk', 5, 60000, '2026-01-01'), ($1, 'masuk', 5, 70000, '2026-02-01')`, [item]);
await asUser(admin, `insert into stock_movements (item_id, type, quantity, recipient_employee_id, recipient) values ($1, 'keluar', -3, $2, 'PC Anis')`, [item, emp]);
let level = (await asUser(viewer, `select stock, total_in, total_out, avg_price from stock_levels where id = $1`, [item])).rows[0];
check(`stok = 7, masuk 10, keluar 3 (dapat ${level.stock}/${level.total_in}/${level.total_out})`, level.stock === 7 && level.total_in === 10 && level.total_out === 3);
check(`harga rata-rata 65.000 (dapat ${level.avg_price})`, Number(level.avg_price) === 65000);

check("barang keluar melebihi stok ditolak", await fails(() => asUser(admin, `insert into stock_movements (item_id, type, quantity) values ($1, 'keluar', -8)`, [item])));
check("barang keluar dengan jumlah positif ditolak", await fails(() => asUser(admin, `insert into stock_movements (item_id, type, quantity) values ($1, 'keluar', 2)`, [item])));
check("viewer tidak bisa mencatat barang keluar", await fails(() => asUser(viewer, `insert into stock_movements (item_id, type, quantity) values ($1, 'keluar', -1)`, [item])));

await asUser(admin, `insert into stock_movements (item_id, type, quantity, notes) values ($1, 'penyesuaian', -2, 'stok opname')`, [item]);
level = (await asUser(admin, `select stock from stock_levels where id = $1`, [item])).rows[0];
check(`penyesuaian stok opname → 5 (dapat ${level.stock})`, level.stock === 5);
check("penyesuaian yang membuat stok minus ditolak", await fails(() => asUser(admin, `insert into stock_movements (item_id, type, quantity) values ($1, 'penyesuaian', -6)`, [item])));

const stockLogs = (await asUser(admin, `select count(*)::int as n from activity_log where table_name in ('stock_items', 'stock_movements')`)).rows[0].n;
check("log aktivitas stok tercatat", (stockLogs as number) >= 5);

// ---------- Fase 3: maintenance, langganan, laptop pribadi ----------
const pc2 = (await asUser(admin, `insert into assets (code, company_id, category, name, last_cleaned_at) values ('FTK-PC-050', $1, 'pc', 'PC Uji', '2026-01-15') returning id`, [company])).rows[0].id;
let sched = (await asUser(viewer, `select last_done::text, next_due::text, interval_months from maintenance_schedule where asset_id = $1`, [pc2])).rows[0];
check(`jadwal: dibersihkan 15 Jan + 6 bulan → 15 Jul (dapat ${sched.next_due})`, sched.next_due === "2026-07-15" && sched.interval_months === 6);

await asUser(admin, `insert into maintenance_logs (asset_id, type, performed_at, description) values ($1, 'pembersihan', '2026-03-01', 'Bersihkan debu')`, [pc2]);
sched = (await asUser(admin, `select next_due::text from maintenance_schedule where asset_id = $1`, [pc2])).rows[0];
const cleaned = (await asUser(admin, `select last_cleaned_at::text as d from assets where id = $1`, [pc2])).rows[0].d;
check(`pembersihan baru memajukan jadwal ke 1 Sep (dapat ${sched.next_due}) & tgl dibersihkan aset (${cleaned})`, sched.next_due === "2026-09-01" && cleaned === "2026-03-01");
check("viewer tidak bisa mencatat maintenance", await fails(() => asUser(viewer, `insert into maintenance_logs (asset_id, description) values ($1, 'x')`, [pc2])));
check("kategori tanpa interval (handphone) tidak masuk jadwal", (await asUser(admin, `select count(*)::int as n from maintenance_schedule where category = 'handphone'`)).rows[0].n === 0);

const sub = (await asUser(admin, `insert into subscriptions (name, kind, billing_cycle, amount, next_due_date) values ('Internet Uji', 'internet', 'bulanan', 341300, '2026-01-26') returning id`)).rows[0].id;
const next1 = (await asUser(admin, `select pay_subscription($1, '2026-01-25', null, 'lunas')::text as d`, [sub])).rows[0].d;
check(`bayar bulanan → jatuh tempo 26 Feb (dapat ${next1})`, next1 === "2026-02-26");
const pay = (await asUser(admin, `select period_due::text as p, amount from subscription_payments where subscription_id = $1`, [sub])).rows[0];
check("pembayaran mencatat periode & nominal default", pay.p === "2026-01-26" && Number(pay.amount) === 341300);
const lic = (await asUser(admin, `insert into subscriptions (name, kind, billing_cycle, next_due_date) values ('Lisensi Uji', 'lisensi', 'tahunan', '2027-04-25') returning id`)).rows[0].id;
const next2 = (await asUser(admin, `select pay_subscription($1, '2027-04-20', 65000, null)::text as d`, [lic])).rows[0].d;
check(`bayar tahunan → 25 Apr 2028 (dapat ${next2})`, next2 === "2028-04-25");
check("viewer tidak bisa mencatat pembayaran", await fails(() => asUser(viewer, `select pay_subscription($1, '2026-02-01', null, null)`, [sub])));

const dev = (await asUser(admin, `insert into personal_devices (employee_id, device) values ($1, 'ASUS') returning id`, [emp])).rows[0].id;
await asUser(admin, `insert into personal_repairs (device_id, repaired_at, session, item, cost) values ($1, '2026-02-22', 'Perbaikan 1', 'RAM', 1100000), ($1, '2026-02-22', 'Perbaikan 1', 'SSD', 550000)`, [dev]);
const total = (await asUser(viewer, `select sum(cost)::int as t from personal_repairs where device_id = $1`, [dev])).rows[0].t;
check(`perbaikan laptop pribadi terbaca (total ${total})`, total === 1650000);
check("viewer tidak bisa menambah perbaikan", await fails(() => asUser(viewer, `insert into personal_repairs (device_id, item) values ($1, 'x')`, [dev])));

await db.close();
if (failures) {
  console.error(`\n${failures} pengujian gagal`);
  process.exit(1);
}
console.log("\nSemua pengujian skema lulus");
