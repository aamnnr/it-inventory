import type { Metadata } from "next";
import { FileSpreadsheet } from "lucide-react";
import { Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { getLookups } from "@/lib/data";
import { todayISO } from "@/lib/format";

export const metadata: Metadata = { title: "Laporan" };
export const instant = false; // data selalu segar, lihat (app)/layout.tsx

const SHEETS = [
  ["Ringkasan", "Jumlah aset per status, nilai stok, maintenance terlambat, biaya langganan per bulan"],
  ["Aset", "Semua aset beserta pemegang, lokasi, harga, dan spesifikasi (tanpa data sensitif)"],
  ["Stok", "Stok gudang IT saat ini, status perlu dibeli, dan nilai stok"],
  ["Transaksi Stok", "Barang masuk, keluar, dan penyesuaian dalam periode"],
  ["Jadwal Maintenance", "Status jatuh tempo pembersihan rutin tiap perangkat"],
  ["Riwayat Maintenance", "Service, perbaikan, upgrade dalam periode beserta biaya"],
  ["Langganan", "Internet & lisensi, nominal, dan jatuh tempo"],
  ["Pembayaran Langganan", "Pembayaran yang dicatat dalam periode"],
  ["Perbaikan Laptop Pribadi", "Perbaikan dalam periode beserta biaya"],
  ["Karyawan", "Daftar karyawan dan jumlah aset yang dipegang"],
];

export default async function ReportPage() {
  await getCurrentUser();
  const { companies } = await getLookups();
  const today = todayISO();

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Laporan"
        subtitle="Unduh laporan lengkap dalam satu file Excel, untuk arsip bulanan atau laporan ke manajemen."
      />
      <div className="grid gap-5 lg:grid-cols-5">
        <Card title="Buat Laporan" className="lg:col-span-2 self-start">
          {/* <form> GET biasa (bukan next/form): browser langsung mengunduh file dari route /laporan/export */}
          <form action="/laporan/export" method="get" className="space-y-4">
            <Field label="Unit Bisnis">
              <Select name="unit" defaultValue="">
                <option value="">Semua unit</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.code}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Periode transaksi dari">
              <Input type="date" name="dari" defaultValue={`${today.slice(0, 4)}-01-01`} required />
            </Field>
            <Field label="Sampai" hint="Periode berlaku untuk transaksi stok, maintenance, pembayaran, dan perbaikan">
              <Input type="date" name="sampai" defaultValue={today} required />
            </Field>
            <Button type="submit" className="w-full">
              <FileSpreadsheet className="size-4" /> Unduh Excel
            </Button>
          </form>
        </Card>

        <Card title="Isi Laporan" className="lg:col-span-3" flush>
          <ul className="divide-y divide-border">
            {SHEETS.map(([name, desc]) => (
              <li key={name} className="px-4 py-2.5 text-sm">
                <p className="font-medium">{name}</p>
                <p className="text-xs text-muted">{desc}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
