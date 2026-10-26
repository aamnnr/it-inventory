export const STOCK_CATEGORIES = [
  "Tinta & Kertas",
  "Aksesoris",
  "Sparepart",
  "Jaringan",
  "Kelistrikan",
  "Perangkat",
  "Alat Kerja",
  "Lainnya",
] as const;

export const MOVEMENT_TYPES = {
  masuk: "Barang Masuk",
  keluar: "Barang Keluar",
  penyesuaian: "Penyesuaian",
} as const;
export type MovementType = keyof typeof MOVEMENT_TYPES;

export type StockItem = {
  id: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  min_stock: number;
  location: string | null;
  printer: string | null;
  ink_code: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

/** Baris view stock_levels */
export type StockLevel = StockItem & {
  stock: number;
  total_in: number;
  total_out: number;
  avg_price: number | null;
  last_moved_at: string | null;
};

export type StockMovement = {
  id: string;
  item_id: string;
  type: MovementType;
  quantity: number;
  moved_at: string;
  unit_price: number | null;
  warranty: string | null;
  recipient_employee_id: string | null;
  recipient_company_id: string | null;
  recipient: string | null;
  asset_id: string | null;
  notes: string | null;
  created_at: string;
};

export type StockStatus = "habis" | "menipis" | "aman";

export function stockStatus(item: Pick<StockLevel, "stock" | "min_stock">): StockStatus {
  if (item.stock <= 0) return "habis";
  if (item.min_stock > 0 && item.stock <= item.min_stock) return "menipis";
  return "aman";
}

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  habis: "Habis",
  menipis: "Menipis",
  aman: "Tersedia",
};
