# Inventaris IT — Kembar Futa Group (KFG)

Aplikasi web untuk tim IT Support KFG mengelola inventaris perangkat IT di semua unit bisnis:
Futake, Futastone, Futafarm, Ayem Tentrem Logam, Futago Karya, dan Tviling.

**Stack:** Next.js 16 · Supabase (PostgreSQL + Auth) · Tailwind CSS · deploy gratis di Vercel.

## Fitur Fase 1

- **Aset IT**: PC, laptop, monitor, handphone, SIM card, UPS, printer, CCTV. Kode otomatis (mis. `FTK-PC-001`), spesifikasi per kategori, filter, pencarian, dan export CSV.
- **Serah terima & riwayat**: siapa memegang apa, sejak kapan, pindah tangan, pengembalian. Bisa juga diserahkan ke departemen (aset bersama).
- **Karyawan**: status aktif/pindah/resign, aset yang sedang dipegang, dan peringatan bila eks-karyawan masih memegang aset.
- **Data induk**: unit bisnis, departemen, lokasi.
- **Keamanan**: login wajib; peran **Admin** (boleh mengubah) dan **Viewer** (hanya melihat). NIK, KK, dan password NVR disimpan **terenkripsi** dan hanya bisa dibuka admin. Setiap perubahan tercatat di **log aktivitas**.
- **Import otomatis** dari file Excel lama di folder `Data/`.

## Fitur Fase 2: Stok Barang

- **Stok gudang IT KFG**: barang habis pakai, sparepart, perangkat jaringan, kelistrikan, dan tinta printer. Stok dihitung otomatis dari transaksi.
- **Barang masuk** (harga dan garansi), **barang keluar** (penerima, unit bisnis, keperluan), dan **penyesuaian** (stok opname, rusak, hilang). Stok tidak bisa minus.
- **Stok minimum**: barang yang mencapai batas muncul sebagai "Perlu Dibeli" di Dashboard.
- **Riwayat transaksi**: filter per jenis, unit, dan bulan, beserta rekap pemakaian per unit bisnis.
- Export CSV daftar stok.

## Fitur Fase 4: Label QR, Laporan, Pengguna

- **Label QR**: cetak label stiker (A4, 3 kolom) per unit/kategori, atau per aset dari halaman detail. Scan dengan kamera HP untuk membuka detail aset (`/q/KODE-ASET`). Bila belum login, pengguna diarahkan ke halaman tersebut setelah login.
- **Laporan Excel**: satu file `.xlsx` berisi 10 sheet (ringkasan, aset, stok, transaksi, maintenance, langganan, pembayaran, perbaikan laptop pribadi, karyawan), dengan filter unit bisnis dan periode.
- **Kelola Pengguna**: ubah nama dan peran Admin/Viewer dari aplikasi. Admin terakhir tidak bisa diturunkan.

## Fitur Fase 3: Perawatan

- **Maintenance**: jadwal pembersihan rutin per kategori (PC/laptop 6 bulan, printer 3 bulan, UPS/CCTV 12 bulan; bisa diubah). Daftar aset yang terlambat atau jatuh tempo dalam 30 hari, plus riwayat service, perbaikan, dan upgrade beserta biayanya.
- **Langganan & Lisensi**: internet, lisensi software, dan tagihan rutin. Tombol **Tandai Sudah Dibayar** mencatat pembayaran dan otomatis memajukan jatuh tempo 1 bulan/1 tahun. Ada perkiraan biaya per bulan.
- **Laptop Pribadi**: laptop milik karyawan yang dipakai bekerja, beserta riwayat perbaikan dan biayanya.
- **Pengingat**: badge kuning di menu dan kartu "Pengingat Jatuh Tempo" di Dashboard untuk tagihan ≤ 14 hari dan maintenance yang terlambat.

---

## Setup (sekali saja)

### 1. Buat proyek Supabase (gratis)

1. Daftar/masuk di <https://supabase.com>, lalu **New project**. Pilih region **Singapore**.
2. Buka **SQL Editor → New query**, salin seluruh isi `supabase/migrations/0001_init.sql`, lalu klik **Run**.
   Ulangi untuk `0002_stock.sql` (Fase 2), `0003_maintenance.sql` (Fase 3), dan `0004_users.sql` (Fase 4), satu file per query, dan jalankan berurutan.
   Pastikan role yang dipakai adalah **postgres**, bukan *read-only*.
3. Buka **Authentication → Sign In / Providers**, lalu **matikan "Allow new users to sign up"**.
   Akun hanya dibuat oleh admin, sehingga orang luar tidak bisa mendaftar sendiri.
4. Buka **Authentication → Users → Add user → Create new user**. Isi email dan password, lalu centang **Auto Confirm User**.
   **Akun pertama otomatis menjadi Admin**; akun berikutnya menjadi Viewer.

### 2. Isi `.env.local`

File `.env.local` sudah dibuat beserta `SECRETS_KEY`. Isi tiga nilai lainnya dari Supabase (**Project Settings → API Keys**):

| Variabel | Ambil dari |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (atau *anon public*) |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key (atau *service_role*). Hanya untuk import. |

> ⚠️ **Simpan `SECRETS_KEY` di tempat aman** (mis. password manager). Jika hilang, data sensitif
> yang sudah terenkripsi tidak bisa dibuka lagi. Nilainya harus sama di laptop dan di Vercel.

### 3. Import data Excel lama

```bash
npm install
npm run import            # cek dulu: membuat import-output/laporan-import.md, database tidak diubah
npm run import -- --commit  # benar-benar memasukkan data ke Supabase
```

Baca `import-output/laporan-import.md` sebelum `--commit`. Bagian **"Perlu dicek"** berisi:
nama yang dicocokkan otomatis, eks-karyawan yang masih memegang aset, nomor seri ganda, dan lainnya.
Ejaan nama yang salah ketik bisa diatur di `NAME_ALIASES` dalam `scripts/import-excel.mts`.
Import menolak berjalan bila database sudah berisi aset, sehingga data tidak dobel.

Untuk stok barang (Fase 2), langkahnya sama dengan laporan di `import-output/laporan-stok.md`:

```bash
npm run import:stok
npm run import:stok -- --commit
```

### 4. Jalankan di laptop

```bash
npm run dev
```

Buka <http://localhost:3000> lalu masuk dengan akun dari langkah 1.

### 5. Deploy ke Vercel (gratis)

1. Upload proyek ini ke GitHub. Folder `Data/`, `import-output/`, dan `.env.local` **tidak ikut** karena sudah ada di `.gitignore`.
2. Di <https://vercel.com>, pilih **Add New → Project**, lalu import repo tersebut.
3. Di **Environment Variables**, isi `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, dan `SECRETS_KEY`.
   **Jangan** masukkan `SUPABASE_SERVICE_ROLE_KEY` ke Vercel.
4. Klik **Deploy**.

---

## Kelola pengguna

- **Tambah pengguna:** Supabase → Authentication → Users → Add user (centang Auto Confirm). Peran awalnya Viewer.
- **Ubah peran (Admin/Viewer) atau nama:** menu **Pengguna** di aplikasi (khusus admin).

## Catatan paket gratis

- Supabase Free **berhenti sementara (pause) bila tidak dibuka selama 7 hari**. Data tetap aman; aktifkan lagi lewat dashboard Supabase.
- Paket gratis tidak punya backup otomatis. Gunakan **Export CSV** di halaman Aset secara berkala.
- Vercel Hobby resminya untuk penggunaan non-komersial. Setelah dipakai resmi, pertimbangkan Vercel Pro atau Cloudflare.

## Untuk developer

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Server pengembangan |
| `npm run build` | Build produksi |
| `npm run test:db` | Uji skema SQL (RLS, serah terima, enkripsi, log) dengan PGlite, tanpa Supabase |
| `npm run import` | Import aset dari Excel (`-- --commit` untuk menulis ke database) |
| `npm run import:stok` | Import stok barang dan tinta dari Excel (`-- --commit` untuk menulis) |
| `npm run import:fase3` | Import langganan & laptop pribadi dari Excel (`-- --commit` untuk menulis) |
| `npm run gen-key` | Membuat `SECRETS_KEY` baru |

Struktur penting:

```
supabase/migrations/   skema database + Row Level Security
scripts/               import Excel & uji skema
src/lib/categories.ts  daftar kategori aset & kolom spesifikasinya
src/app/(app)/         halaman yang memerlukan login (dashboard, aset, karyawan, data induk, log)
src/proxy.ts           mengarahkan pengguna yang belum login ke /login
```
