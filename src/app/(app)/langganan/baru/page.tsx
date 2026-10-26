import type { Metadata } from "next";
import { SubscriptionForm } from "@/components/subscription-forms";
import { Card, PageHeader } from "@/components/ui";
import { adminPage } from "@/lib/auth";
import { getLookups } from "@/lib/data";

export const metadata: Metadata = { title: "Tambah Langganan" };
export const instant = false; // data selalu segar, lihat (app)/layout.tsx

export default async function NewSubscriptionPage() {
  await adminPage("/langganan");
  const { companies } = await getLookups();
  return (
    <div className="max-w-3xl">
      <PageHeader title="Tambah Langganan" subtitle="Internet, lisensi software, domain, atau tagihan rutin lainnya." />
      <Card>
        <SubscriptionForm companies={companies} />
      </Card>
    </div>
  );
}
