import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { queryAssets, readFilters } from "@/lib/asset-query";
import { ASSET_STATUSES, categoryLabel, publicFields, type AssetCategory } from "@/lib/categories";

// Export daftar aset (sesuai filter) ke CSV yang bisa dibuka di Excel. Data sensitif tidak ikut.
export async function GET(request: NextRequest) {
  await getCurrentUser();
  const filters = readFilters(Object.fromEntries(request.nextUrl.searchParams));
  const { rows } = await queryAssets(filters, { all: true });

  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    "Kode", "Unit", "Kategori", "Nama", "Status", "Pemegang", "Dipakai Bersama", "Departemen", "Lokasi",
    "Nomor Seri", "Hostname", "Tanggal Beli", "Harga Beli", "Terakhir Dibersihkan", "Spesifikasi", "Catatan",
  ];
  const lines = rows.map((a) => {
    const specs = publicFields(a.category as AssetCategory)
      .filter((f) => a.specs?.[f.key])
      .map((f) => `${f.label}: ${a.specs[f.key]}`)
      .join(" | ");
    return [
      a.code, a.company?.name, categoryLabel(a.category), a.name, ASSET_STATUSES[a.status], a.holder?.name,
      a.shared_with, a.department?.name, a.location?.name, a.serial_number, a.hostname, a.purchase_date,
      a.purchase_price, a.last_cleaned_at, specs, a.notes,
    ].map(escape).join(";");
  });

  // BOM + pemisah ";" agar langsung terbaca rapi di Excel berbahasa Indonesia
  const csv = "﻿" + [header.join(";"), ...lines].join("\r\n");
  const date = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="aset-it-kfg-${date}.csv"`,
    },
  });
}
