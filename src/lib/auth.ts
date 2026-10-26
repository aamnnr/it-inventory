import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "viewer";
};

/** Pengguna yang sedang login (sekali per request). Redirect ke /login bila belum login. */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", claims.sub)
    .single();

  const email = (claims.email as string | undefined) ?? "";
  return {
    id: claims.sub,
    email,
    name: profile?.full_name || email,
    role: profile?.role === "admin" ? "admin" : "viewer",
  };
});

/** Untuk halaman khusus admin (form tambah/edit): viewer diarahkan kembali. */
export async function adminPage(fallback: string) {
  const user = await getCurrentUser();
  if (user.role !== "admin") redirect(fallback);
  return user;
}

/** Dipanggil di awal setiap Server Action yang mengubah data. */
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (user.role !== "admin") throw new Error("Hanya admin yang boleh mengubah data");
  return user;
}
