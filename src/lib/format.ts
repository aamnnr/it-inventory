// Semua tanggal ditampilkan dalam WIB, apa pun zona waktu server (Vercel memakai UTC).
const TZ = "Asia/Jakarta";

export function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  // "YYYY-MM-DD" ditafsirkan sebagai tengah hari UTC agar tidak bergeser hari
  const d = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });
}

export function formatRupiah(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

/** Tanggal hari ini (WIB) dalam format YYYY-MM-DD */
export function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}
