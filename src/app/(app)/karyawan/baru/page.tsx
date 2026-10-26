import type { Metadata } from "next";
import { EmployeeForm } from "@/components/employee-form";
import { Card, PageHeader } from "@/components/ui";
import { adminPage } from "@/lib/auth";
import { getLookups } from "@/lib/data";

export const metadata: Metadata = { title: "Tambah Karyawan" };
export const instant = false; // data selalu segar, lihat (app)/layout.tsx

export default async function NewEmployeePage() {
  await adminPage("/karyawan");
  const { companies, departments } = await getLookups();
  return (
    <div className="max-w-3xl">
      <PageHeader title="Tambah Karyawan" />
      <Card>
        <EmployeeForm companies={companies} departments={departments} />
      </Card>
    </div>
  );
}
