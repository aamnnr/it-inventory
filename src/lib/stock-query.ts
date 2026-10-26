import "server-only";
import { createClient } from "./supabase/server";
import { stockStatus, type StockLevel } from "./stock";

export type StockFilters = { kategori?: string; status?: string; q?: string; page?: string };

export function readStockFilters(sp: Record<string, string | string[] | undefined>): StockFilters {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  return { kategori: one("kategori"), status: one("status"), q: one("q"), page: one("page") };
}

/** true bila barang perlu dibeli lagi (punya stok minimum dan sudah mencapainya) */
export function needsRestock(i: Pick<StockLevel, "stock" | "min_stock">) {
  return i.min_stock > 0 && i.stock <= i.min_stock;
}

export async function getStockLevels() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("stock_levels").select("*").order("code");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ ...r, avg_price: r.avg_price === null ? null : Number(r.avg_price) })) as StockLevel[];
}

export function filterStock(levels: StockLevel[], f: StockFilters) {
  const q = f.q?.trim().toLowerCase();
  return levels.filter((i) => {
    if (f.status === "arsip" ? i.active : !i.active) return false;
    if (f.kategori && i.category !== f.kategori) return false;
    if (f.status === "tersedia" && i.stock <= 0) return false;
    if (f.status === "restock" && !needsRestock(i)) return false;
    if (f.status === "habis" && stockStatus(i) !== "habis") return false;
    if (q && ![i.name, i.code, i.printer, i.ink_code, i.location].some((v) => v?.toLowerCase().includes(q))) return false;
    return true;
  });
}
