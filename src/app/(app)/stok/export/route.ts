import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { filterStock, getStockLevels, readStockFilters } from "@/lib/stock-query";

// Export daftar stok (sesuai filter) ke CSV untuk Excel
export async function GET(request: NextRequest) {
  await getCurrentUser();
  const filters = readStockFilters(Object.fromEntries(request.nextUrl.searchParams));
  const rows = filterStock(await getStockLevels(), filters);

  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    "Kode", "Nama", "Kategori", "Stok", "Satuan", "Stok Minimum", "Total Masuk", "Total Keluar",
    "Harga Rata-rata", "Nilai Stok", "Lokasi", "Printer", "Kode Tinta", "Terakhir Bergerak", "Catatan",
  ];
  const lines = rows.map((i) =>
    [
      i.code, i.name, i.category, i.stock, i.unit, i.min_stock, i.total_in, i.total_out, i.avg_price,
      i.avg_price ? i.avg_price * i.stock : "", i.location, i.printer, i.ink_code, i.last_moved_at, i.notes,
    ].map(escape).join(";"),
  );
  const csv = "﻿" + [header.join(";"), ...lines].join("\r\n");
  const date = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="stok-it-kfg-${date}.csv"`,
    },
  });
}
