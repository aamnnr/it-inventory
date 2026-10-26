import type { Metadata } from "next";
import { DeviceForm } from "@/components/personal-forms";
import { Card, PageHeader } from "@/components/ui";
import { adminPage } from "@/lib/auth";
import { getLookups } from "@/lib/data";

export const metadata: Metadata = { title: "Tambah Laptop Pribadi" };
export const instant = false; // data selalu segar, lihat (app)/layout.tsx

export default async function NewDevicePage() {
  await adminPage("/laptop-pribadi");
  const { companies, employees } = await getLookups();
  return (
    <div className="max-w-3xl">
      <PageHeader title="Tambah Laptop Pribadi" subtitle="Daftarkan laptop milik karyawan yang dipakai untuk bekerja." />
      <Card>
        <DeviceForm companies={companies} employees={employees} />
      </Card>
    </div>
  );
}
