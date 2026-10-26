import type { Metadata } from "next";
import { AssetForm } from "@/components/asset-form";
import { PageHeader } from "@/components/ui";
import { adminPage } from "@/lib/auth";
import { getLookups } from "@/lib/data";

export const metadata: Metadata = { title: "Tambah Aset" };
export const instant = false; // data selalu segar, lihat (app)/layout.tsx

export default async function NewAssetPage() {
  await adminPage("/aset");
  const lookups = await getLookups();
  return (
    <div className="max-w-4xl">
      <PageHeader title="Tambah Aset" subtitle="Kode aset dibuat otomatis sesuai unit bisnis dan kategori." />
      <AssetForm {...lookups} />
    </div>
  );
}
