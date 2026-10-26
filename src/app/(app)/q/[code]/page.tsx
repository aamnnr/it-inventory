import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const instant = false; // data selalu segar, lihat (app)/layout.tsx

// Tujuan scan QR di label aset: /q/FTK-PC-001 → /aset/{id}
export default async function QrRedirectPage({ params }: PageProps<"/q/[code]">) {
  const { code } = await params;
  await getCurrentUser();
  const supabase = await createClient();
  const { data } = await supabase.from("assets").select("id").eq("code", decodeURIComponent(code)).maybeSingle();
  if (!data) notFound();
  redirect(`/aset/${data.id}`);
}
