import "server-only";
import { createClient } from "./supabase/server";
import { searchTerm } from "./data";
import type { Asset } from "./types";

export type AssetFilters = {
  unit?: string;      // kode unit bisnis, mis. FTK
  kategori?: string;
  status?: string;
  q?: string;
  page?: string;
};

export type AssetListRow = Asset & {
  company: { code: string; name: string } | null;
  holder: { id: string; name: string } | null;
  department: { name: string } | null;
  location: { name: string } | null;
};

export const PAGE_SIZE = 25;

export function readFilters(sp: Record<string, string | string[] | undefined>): AssetFilters {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  return { unit: one("unit"), kategori: one("kategori"), status: one("status"), q: one("q"), page: one("page") };
}

/** Query daftar aset sesuai filter. `all` = tanpa paginasi (untuk export). */
export async function queryAssets(filters: AssetFilters, opts: { all?: boolean } = {}) {
  const supabase = await createClient();
  let query = supabase
    .from("assets")
    .select(
      "*, company:company_id(code, name), holder:holder_employee_id(id, name), department:department_id(name), location:location_id(name)",
      { count: "exact" },
    )
    .order("code");

  if (filters.unit) {
    const { data: company } = await supabase.from("companies").select("id").eq("code", filters.unit).maybeSingle();
    query = query.eq("company_id", company?.id ?? "00000000-0000-0000-0000-000000000000");
  }
  if (filters.kategori) query = query.eq("category", filters.kategori);
  if (filters.status) query = query.eq("status", filters.status);

  const term = searchTerm(filters.q);
  if (term) {
    // cari juga berdasarkan nama pemegang
    const { data: emps } = await supabase.from("employees").select("id").ilike("name", term).limit(100);
    const conditions = [`code.ilike.${term}`, `name.ilike.${term}`, `hostname.ilike.${term}`, `serial_number.ilike.${term}`];
    if (emps?.length) conditions.push(`holder_employee_id.in.(${emps.map((e) => e.id).join(",")})`);
    query = query.or(conditions.join(","));
  }

  const page = Math.max(1, Number(filters.page) || 1);
  if (!opts.all) query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as AssetListRow[], count: count ?? 0, page };
}

export function filterHref(base: string, filters: AssetFilters, patch: Partial<AssetFilters>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...filters, ...patch })) if (v) params.set(k, v);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
