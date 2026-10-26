import type { Metadata } from "next";
import { ProfileRow } from "@/components/profile-form";
import { Card, PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Pengguna" };
export const instant = false; // data selalu segar, lihat (app)/layout.tsx

type Profile = { id: string; full_name: string | null; email: string | null; role: "admin" | "viewer"; created_at: string };

export default async function UsersPage() {
  const user = await getCurrentUser();
  const isAdmin = user.role === "admin";
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, full_name, email, role, created_at").order("created_at");
  const profiles = ((data ?? []) as Profile[]).filter((p) => isAdmin || p.id === user.id);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={isAdmin ? "Kelola Pengguna" : "Profil Saya"}
        subtitle={
          isAdmin
            ? "Admin IT boleh mengubah semua data. Viewer hanya bisa melihat."
            : "Ubah nama yang tampil di aplikasi dan di log aktivitas."
        }
      />
      <Card flush title={isAdmin ? `Pengguna (${profiles.length})` : undefined}>
        <div className="divide-y divide-border">
          {profiles.map((p) => (
            <ProfileRow key={p.id} profile={p} canEditRole={isAdmin} isSelf={p.id === user.id} />
          ))}
        </div>
      </Card>

      {isAdmin && (
        <Card title="Menambah pengguna baru" className="mt-5">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted">
            <li>Buka dashboard Supabase → <b className="text-foreground">Authentication → Users → Add user → Create new user</b>.</li>
            <li>Isi email & password sementara, centang <b className="text-foreground">Auto Confirm User</b>.</li>
            <li>Pengguna baru otomatis menjadi <b className="text-foreground">Viewer</b> dan muncul di daftar ini. Ubah perannya bila perlu.</li>
            <li>Berikan email & password ke orangnya, minta ganti password lewat Supabase bila perlu.</li>
          </ol>
          <p className="mt-3 text-xs text-muted">
            Pembuatan akun sengaja tidak dilakukan dari aplikasi karena membutuhkan kunci rahasia Supabase yang tidak boleh dipasang di server web.
          </p>
        </Card>
      )}
    </div>
  );
}
