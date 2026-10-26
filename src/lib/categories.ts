// Definisi kategori aset & kolom spesifikasi masing-masing.
// Dipakai oleh form, halaman detail, dan script import Excel.

export type SpecField = {
  key: string;
  label: string;
  /** Disimpan terenkripsi di tabel asset_secrets, hanya admin yang bisa melihat */
  secret?: boolean;
  multiline?: boolean;
};

export type CategoryDef = {
  label: string;
  /** Prefix kode aset, mis. FTK-PC-001 */
  prefix: string;
  fields: SpecField[];
};

const computerFields: SpecField[] = [
  { key: "processor", label: "Processor" },
  { key: "cpu_speed", label: "Base Speed CPU" },
  { key: "cpu_cores", label: "Core / Thread" },
  { key: "cpu_socket", label: "Socket Processor" },
  { key: "cpu_temp_idle", label: "Suhu CPU Idle" },
  { key: "motherboard", label: "Motherboard" },
  { key: "board_slots", label: "Slot RAM / M.2 / SATA" },
  { key: "ram", label: "RAM" },
  { key: "ram_detail", label: "Detail Keping RAM", multiline: true },
  { key: "storage", label: "Storage" },
  { key: "storage_detail", label: "Merek / Kesehatan / Kecepatan Storage", multiline: true },
  { key: "vga_integrated", label: "VGA Integrated" },
  { key: "vga_dedicated", label: "VGA Dedicated" },
  { key: "psu", label: "PSU" },
  { key: "os", label: "Sistem Operasi" },
  { key: "software", label: "Software Wajib" },
  { key: "monitor", label: "Monitor" },
  { key: "keyboard", label: "Keyboard" },
  { key: "mouse", label: "Mouse" },
  { key: "wifi_dongle", label: "Dongle WiFi" },
  { key: "accessories", label: "Perlengkapan Lain" },
  { key: "issues_software", label: "Kendala Software", multiline: true },
  { key: "issues_hardware", label: "Kendala Hardware", multiline: true },
];

export const CATEGORIES = {
  pc: { label: "PC Desktop", prefix: "PC", fields: computerFields },
  laptop: { label: "Laptop", prefix: "LTP", fields: computerFields },
  monitor: {
    label: "Monitor",
    prefix: "MON",
    fields: [
      { key: "size", label: "Ukuran" },
      { key: "resolution", label: "Resolusi" },
    ],
  },
  handphone: {
    label: "Handphone",
    prefix: "HP",
    fields: [
      { key: "phone_number", label: "Nomor Terkait" },
      { key: "email", label: "Email Terkait" },
      { key: "processor", label: "Processor" },
      { key: "ram", label: "RAM" },
      { key: "rom", label: "ROM" },
      { key: "battery", label: "Baterai / Kesehatan Baterai" },
      { key: "charger", label: "Charger" },
      { key: "tempered_glass", label: "Tempered Glass" },
      { key: "casing", label: "Casing" },
      { key: "accessories", label: "Kelengkapan" },
      { key: "service", label: "Riwayat Service", multiline: true },
    ],
  },
  simcard: {
    label: "SIM Card",
    prefix: "SIM",
    fields: [
      { key: "phone_number", label: "Nomor" },
      { key: "provider", label: "Provider / Merek Kartu" },
      { key: "device", label: "Dipasang di HP" },
      { key: "purpose", label: "Peruntukan" },
      { key: "active_until", label: "Masa Aktif" },
      { key: "balance", label: "Pulsa" },
      { key: "activation_method", label: "Metode Aktivasi" },
      { key: "nik", label: "NIK Registrasi", secret: true },
      { key: "kk", label: "No. KK Registrasi", secret: true },
      { key: "sim_digits", label: "6 Digit Akhir Nomor SIM", secret: true },
    ],
  },
  ups: {
    label: "UPS",
    prefix: "UPS",
    fields: [
      { key: "model", label: "Tipe / Model" },
      { key: "size", label: "Ukuran (Besar/Kecil)" },
      { key: "capacity", label: "Daya" },
      { key: "outlets", label: "Jumlah Colokan" },
      { key: "issues", label: "Kendala", multiline: true },
    ],
  },
  printer: {
    label: "Printer",
    prefix: "PRN",
    fields: [
      { key: "ink_code", label: "Kode Tinta" },
      { key: "access", label: "Akses Via" },
      { key: "server_hostname", label: "Hostname PC Server" },
      { key: "total_print", label: "Total Print" },
      { key: "service", label: "Riwayat Service", multiline: true },
      { key: "issues", label: "Kendala", multiline: true },
    ],
  },
  cctv: {
    label: "CCTV",
    prefix: "CCTV",
    fields: [
      { key: "connection", label: "Jalur Koneksi" },
      { key: "verification_code", label: "Kode Verifikasi", secret: true },
      { key: "nvr_password", label: "Password NVR", secret: true },
    ],
  },
  lainnya: { label: "Lainnya", prefix: "LN", fields: [] },
} satisfies Record<string, CategoryDef>;

export type AssetCategory = keyof typeof CATEGORIES;
export const CATEGORY_KEYS = Object.keys(CATEGORIES) as AssetCategory[];

export function categoryLabel(c: string) {
  return (CATEGORIES as Record<string, CategoryDef>)[c]?.label ?? c;
}

export function publicFields(c: AssetCategory) {
  return (CATEGORIES[c].fields as SpecField[]).filter((f) => !f.secret);
}

export function secretFields(c: AssetCategory) {
  return (CATEGORIES[c].fields as SpecField[]).filter((f) => f.secret);
}

export const ASSET_STATUSES = {
  dipakai: "Dipakai",
  tersedia: "Tersedia",
  perbaikan: "Dalam Perbaikan",
  rusak: "Rusak",
  pensiun: "Dipensiunkan",
} as const;
export type AssetStatus = keyof typeof ASSET_STATUSES;

export const EMPLOYEE_STATUSES = {
  aktif: "Aktif",
  pindah: "Pindah",
  resign: "Resign",
} as const;
export type EmployeeStatus = keyof typeof EMPLOYEE_STATUSES;
