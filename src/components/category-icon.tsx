import {
  BatteryCharging,
  Cctv,
  CreditCard,
  Laptop,
  Monitor,
  Package,
  Printer,
  Smartphone,
  type LucideIcon,
} from "lucide-react";

// Ikon kotak berwarna per kategori, seperti ikon baris pada referensi tabel
export const CATEGORY_STYLE: Record<string, { icon: LucideIcon; color: string }> = {
  pc: { icon: Monitor, color: "bg-sky-500" },
  laptop: { icon: Laptop, color: "bg-indigo-500" },
  monitor: { icon: Monitor, color: "bg-cyan-500" },
  handphone: { icon: Smartphone, color: "bg-emerald-500" },
  simcard: { icon: CreditCard, color: "bg-lime-500" },
  ups: { icon: BatteryCharging, color: "bg-amber-500" },
  printer: { icon: Printer, color: "bg-orange-500" },
  cctv: { icon: Cctv, color: "bg-rose-500" },
  lainnya: { icon: Package, color: "bg-zinc-500" },
};

export function CategoryIcon({ category, size = "sm" }: { category: string; size?: "sm" | "lg" }) {
  const { icon: Icon, color } = CATEGORY_STYLE[category] ?? CATEGORY_STYLE.lainnya;
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-md text-white ${color} ${size === "lg" ? "size-10" : "size-5"}`}>
      <Icon className={size === "lg" ? "size-5" : "size-3"} />
    </span>
  );
}
