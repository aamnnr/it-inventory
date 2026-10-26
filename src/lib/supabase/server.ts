import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { createServerClient } from "@supabase/ssr";

/** Klien Supabase atas nama pengguna yang login (RLS berlaku). */
export async function createClient() {
  // Supabase memeriksa masa berlaku sesi dengan Date.now(); pastikan hanya berjalan saat request,
  // bukan saat Next.js melakukan prerender.
  await connection();
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
          } catch {
            // Dipanggil dari Server Component: cookie di-refresh oleh proxy.ts
          }
        },
      },
    },
  );
}
