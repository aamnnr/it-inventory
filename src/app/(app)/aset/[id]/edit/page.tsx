import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AssetForm } from "@/components/asset-form";
import { PageHeader } from "@/components/ui";
import { adminPage } from "@/lib/auth";
import { getLookups } from "@/lib/data";
import { decryptSecrets } from "@/lib/secrets";
import { createClient } from "@/lib/supabase/server";
import type { Asset } from "@/lib/types";

export const metadata: Metadata = { title: "Edit Aset" };
export const instant = false; // data selalu segar, lihat (app)/layout.tsx

export default async function EditAssetPage({ params }: PageProps<"/aset/[id]/edit">) {
  const { id } = await params;
  await adminPage(`/aset/${id}`);
  const supabase = await createClient();
  const [{ data: asset }, { data: secretRow }, lookups] = await Promise.all([
    supabase.from("assets").select("*").eq("id", id).maybeSingle(),
    supabase.from("asset_secrets").select("ciphertext").eq("asset_id", id).maybeSingle(),
    getLookups(),
  ]);
  if (!asset) notFound();

  return (
    <div className="max-w-4xl">
      <PageHeader title={`Edit ${asset.code}`} subtitle={asset.name} />
      <AssetForm
        asset={asset as Asset}
        secrets={secretRow ? decryptSecrets(secretRow.ciphertext) : {}}
        {...lookups}
      />
    </div>
  );
}
