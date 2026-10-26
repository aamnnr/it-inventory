import type { Metadata } from "next";
import { ItemForm } from "@/components/stock-forms";
import { Card, PageHeader } from "@/components/ui";
import { adminPage } from "@/lib/auth";

export const metadata: Metadata = { title: "Barang Baru" };
export const instant = false; // data selalu segar, lihat (app)/layout.tsx

export default async function NewStockItemPage() {
  await adminPage("/stok");
  return (
    <div className="max-w-3xl">
      <PageHeader title="Barang Baru" subtitle="Daftarkan jenis barang baru. Kode barang dibuat otomatis." />
      <Card>
        <ItemForm />
      </Card>
    </div>
  );
}
