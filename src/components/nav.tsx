"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Boxes,
  ChevronRight,
  Database,
  Laptop,
  LayoutDashboard,
  Receipt,
  Users,
  Warehouse,
  Wrench,
  type LucideIcon,
} from "lucide-react";

type Item = {
  href: string;
  label: string;
  icon: LucideIcon;
  countKey?: keyof NavCounts;
  /** angka berupa peringatan: hanya tampil bila > 0, berwarna kuning */
  alert?: boolean;
};

const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: "Inventaris",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/aset", label: "Aset IT", icon: Boxes, countKey: "assets" },
      { href: "/stok", label: "Stok Barang", icon: Warehouse, countKey: "stock" },
      { href: "/karyawan", label: "Karyawan", icon: Users, countKey: "employees" },
    ],
  },
  {
    title: "Perawatan",
    items: [
      { href: "/maintenance", label: "Maintenance", icon: Wrench, countKey: "maintenanceDue", alert: true },
      { href: "/langganan", label: "Langganan", icon: Receipt, countKey: "subscriptionsDue", alert: true },
      { href: "/laptop-pribadi", label: "Laptop Pribadi", icon: Laptop },
    ],
  },
  {
    title: "Pengaturan",
    items: [
      { href: "/master", label: "Data Induk", icon: Database },
      { href: "/log", label: "Log Aktivitas", icon: Activity },
    ],
  },
];

const ALL_ITEMS = SECTIONS.flatMap((s) => s.items);

export type NavCounts = {
  assets: number;
  employees: number;
  stock: number;
  /** aset yang maintenance-nya terlambat / jatuh tempo hari ini */
  maintenanceDue: number;
  /** langganan yang terlambat atau jatuh tempo ≤ 7 hari */
  subscriptionsDue: number;
};

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function NavLinks({ counts }: { counts?: NavCounts }) {
  const pathname = usePathname();
  return <NavList pathname={pathname} counts={counts} />;
}

/** Tampilan saat jumlah & path belum siap (prerender) */
export function NavLinksFallback() {
  return <NavList pathname={null} />;
}

function NavList({ pathname, counts }: { pathname: string | null; counts?: NavCounts }) {
  return (
    <div className="flex gap-1 md:flex-col md:gap-5">
      {SECTIONS.map((section) => (
        <div key={section.title} className="flex gap-1 md:flex-col md:gap-0.5">
          <p className="hidden px-2.5 pb-1 text-xs text-muted md:block">{section.title}</p>
          {section.items.map((item) => {
            const active = isActive(pathname, item.href);
            const count = item.countKey ? counts?.[item.countKey] : undefined;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors ${
                  active ? "bg-surface font-medium shadow-sm ring-1 ring-border" : "text-muted hover:bg-surface/60 hover:text-foreground"
                }`}
              >
                <item.icon className="size-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {count !== undefined && (!item.alert || count > 0) && (
                  <span
                    className={`hidden rounded-md px-1.5 text-xs tabular-nums md:inline ${
                      item.alert
                        ? "bg-amber-400/20 font-medium text-amber-800 dark:text-amber-300"
                        : "bg-subtle text-muted ring-1 ring-border"
                    }`}
                    title={item.alert ? "Perlu ditindaklanjuti" : undefined}
                  >
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const SUB_LABEL: Record<string, string> = {
  baru: "Tambah",
  edit: "Edit",
  transaksi: "Riwayat Transaksi",
  catat: "Catat",
};

/** Judul halaman di bar atas, mis. "Aset IT › Detail" */
export function Breadcrumb() {
  const pathname = usePathname();
  const item = ALL_ITEMS.filter((i) => isActive(pathname, i.href)).pop() ?? ALL_ITEMS[0];
  const rest = pathname.slice(item.href.length).split("/").filter(Boolean);
  const sub = rest.length ? (SUB_LABEL[rest[rest.length - 1]] ?? "Detail") : undefined;
  return (
    <div className="flex items-center gap-2 text-sm">
      <item.icon className="size-4 text-muted" />
      {sub ? (
        <>
          <Link href={item.href} className="text-muted hover:text-foreground">
            {item.label}
          </Link>
          <ChevronRight className="size-3.5 text-muted" />
          <span className="font-medium">{sub}</span>
        </>
      ) : (
        <span className="font-medium">{item.label}</span>
      )}
    </div>
  );
}
