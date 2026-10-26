// Fase 3: maintenance, langganan & lisensi, laptop pribadi
import type { BadgeTone } from "@/components/ui";

export const MAINTENANCE_TYPES = {
  pembersihan: "Pembersihan",
  service: "Service",
  perbaikan: "Perbaikan",
  upgrade: "Upgrade",
  pengecekan: "Pengecekan",
} as const;
export type MaintenanceType = keyof typeof MAINTENANCE_TYPES;

export const SUBSCRIPTION_KINDS = {
  internet: "Internet",
  lisensi: "Lisensi Software",
  domain_hosting: "Domain & Hosting",
  lainnya: "Lainnya",
} as const;
export type SubscriptionKind = keyof typeof SUBSCRIPTION_KINDS;

export const BILLING_CYCLES = { bulanan: "Bulanan", tahunan: "Tahunan", sekali: "Sekali bayar" } as const;
export type BillingCycle = keyof typeof BILLING_CYCLES;

export type MaintenanceLog = {
  id: string;
  asset_id: string;
  type: MaintenanceType;
  performed_at: string;
  description: string;
  cost: number | null;
  performed_by: string | null;
  created_at: string;
};

export type ScheduleRow = {
  asset_id: string;
  code: string;
  name: string;
  category: string;
  company_id: string;
  holder_employee_id: string | null;
  status: string;
  interval_months: number;
  last_done: string | null;
  next_due: string | null;
};

export type Subscription = {
  id: string;
  name: string;
  kind: SubscriptionKind;
  company_id: string | null;
  vendor: string | null;
  account_number: string | null;
  billing_cycle: BillingCycle;
  amount: number | null;
  start_date: string | null;
  next_due_date: string | null;
  contact: string | null;
  email: string | null;
  description: string | null;
  notes: string | null;
  active: boolean;
};

export type SubscriptionPayment = {
  id: string;
  subscription_id: string;
  paid_at: string;
  period_due: string | null;
  amount: number | null;
  notes: string | null;
};

export type PersonalDevice = { id: string; employee_id: string; device: string | null; notes: string | null; created_at: string };

export type PersonalRepair = {
  id: string;
  device_id: string;
  repaired_at: string;
  session: string | null;
  item: string;
  cost: number | null;
  notes: string | null;
};

/** Selisih hari dari `today` ke `date` (keduanya YYYY-MM-DD). Negatif = sudah lewat. */
export function daysUntil(date: string, today: string) {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** Label & warna status jatuh tempo */
export function dueStatus(date: string | null, today: string, soonDays = 7): { label: string; tone: BadgeTone; days: number | null } {
  if (!date) return { label: "Belum ada catatan", tone: "gray", days: null };
  const days = daysUntil(date, today);
  if (days < 0) return { label: `Terlambat ${-days} hari`, tone: "red", days };
  if (days === 0) return { label: "Hari ini", tone: "red", days };
  if (days <= soonDays) return { label: `${days} hari lagi`, tone: "amber", days };
  if (days <= 30) return { label: `${days} hari lagi`, tone: "blue", days };
  return { label: "Terjadwal", tone: "green", days };
}

/** Perkiraan biaya per bulan (tahunan dibagi 12, sekali bayar tidak dihitung) */
export function monthlyCost(s: Pick<Subscription, "amount" | "billing_cycle" | "active">) {
  if (!s.active || !s.amount) return 0;
  return s.billing_cycle === "bulanan" ? s.amount : s.billing_cycle === "tahunan" ? s.amount / 12 : 0;
}
