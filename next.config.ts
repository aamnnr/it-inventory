import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Dipakai di route handler laporan Excel; dimuat langsung oleh Node, tidak di-bundle
  serverExternalPackages: ["exceljs"],
  experimental: {
    // Halaman yang sudah dibuka disimpan di memori browser selama 2 menit, sehingga
    // berpindah ke halaman yang sama tidak memuat ulang data. Setiap aksi simpan/hapus
    // memanggil refresh()/revalidatePath() yang langsung mengosongkan cache ini.
    staleTimes: {
      dynamic: 120,
      static: 300,
    },
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
