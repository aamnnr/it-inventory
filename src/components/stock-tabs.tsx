import Link from "next/link";

/** Sub-navigasi halaman stok */
export function StockTabs({ active }: { active: "barang" | "transaksi" }) {
  const tab = (href: string, label: string, on: boolean) => (
    <Link
      href={href}
      className={`border-b-2 px-1 pb-2 text-sm ${on ? "border-foreground font-medium" : "border-transparent text-muted hover:text-foreground"}`}
    >
      {label}
    </Link>
  );
  return (
    <div className="mb-5 flex gap-5 border-b border-border">
      {tab("/stok", "Daftar Barang", active === "barang")}
      {tab("/stok/transaksi", "Riwayat Transaksi", active === "transaksi")}
    </div>
  );
}
