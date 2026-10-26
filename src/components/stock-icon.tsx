import { Cpu, Droplet, Monitor, Mouse, Network, Package, Plug, Wrench, type LucideIcon } from "lucide-react";
import { Badge } from "./ui";

const STYLE: Record<string, { icon: LucideIcon; color: string }> = {
  "Tinta & Kertas": { icon: Droplet, color: "bg-fuchsia-500" },
  Aksesoris: { icon: Mouse, color: "bg-emerald-500" },
  Sparepart: { icon: Cpu, color: "bg-sky-500" },
  Jaringan: { icon: Network, color: "bg-indigo-500" },
  Kelistrikan: { icon: Plug, color: "bg-amber-500" },
  Perangkat: { icon: Monitor, color: "bg-cyan-600" },
  "Alat Kerja": { icon: Wrench, color: "bg-orange-500" },
};

/** Status stok: menipis/habis (bila punya stok minimum), habis, atau tersedia */
export function StockBadge({ stock, min }: { stock: number; min: number }) {
  if (min > 0 && stock <= min) return <Badge tone={stock <= 0 ? "red" : "amber"}>{stock <= 0 ? "Habis — beli lagi" : "Menipis"}</Badge>;
  if (stock <= 0) return <Badge tone="gray">Habis</Badge>;
  return <Badge tone="green">Tersedia</Badge>;
}

export function StockIcon({ category, size = "sm" }: { category: string; size?: "sm" | "lg" }) {
  const { icon: Icon, color } = STYLE[category] ?? { icon: Package, color: "bg-zinc-500" };
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-md text-white ${color} ${size === "lg" ? "size-10" : "size-5"}`}>
      <Icon className={size === "lg" ? "size-5" : "size-3"} />
    </span>
  );
}
